/**
 * Idempotent application of verified provider events.
 * - Each (provider, event_id) is recorded once; replays of processed/ignored events are no-ops.
 * - Failed processing rolls back all effects and records the failure; a provider retry reprocesses it.
 * - Ledger rows, notifications and emails carry their own idempotency keys as a second line of defence.
 */
import { and, eq, sql } from "drizzle-orm";
import type { DB, Tx } from "../db";
import {
  bookings, courseEnrollments, orderItems, orders, paymentEvents, paymentIntents, providerWebhookEvents, refunds,
  teacherLedgerEntries, teacherProfiles, users,
} from "../db/schema";
import type { NormalizedPaymentEvent } from "./provider";
import { notifyConfirmed, transition } from "../services/bookings";
import { notify } from "../services/notify";
import { audit } from "../services/audit";
import { log } from "../log";
import { canTransition, type BookingStatus } from "../booking/state-machine";
import { enqueueEmail } from "../email/outbox";
import { env } from "../env";

type PIStatus = typeof paymentIntents.$inferSelect["status"];

export type WebhookOutcome = { duplicate: boolean; status: "processed" | "ignored" | "duplicate" };

export async function handleProviderEvent(db: DB, provider: string, raw: { id: string; type: string; payload: unknown }, ev: NormalizedPaymentEvent): Promise<WebhookOutcome> {
  try {
    return await db.transaction(async (tx) => {
      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO provider_webhook_events (provider, event_id, type, payload)
        VALUES (${provider}, ${raw.id}, ${raw.type}, ${JSON.stringify(raw.payload)}::jsonb)
        ON CONFLICT (provider, event_id) DO UPDATE SET received_at = now(), error = NULL
          WHERE provider_webhook_events.status IN ('failed', 'received')
        RETURNING id`);
      if (!ins.rows.length) return { duplicate: true, status: "duplicate" as const };
      const rowId = ins.rows[0].id;
      const status = await apply(tx, provider, ev);
      await tx.update(providerWebhookEvents).set({ status, processedAt: new Date() }).where(eq(providerWebhookEvents.id, rowId));
      return { duplicate: false, status };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("webhook_processing_failed", { provider, eventId: raw.id, type: raw.type, err: msg });
    await db.insert(providerWebhookEvents).values({ provider, eventId: raw.id, type: raw.type, payload: raw.payload as object, status: "failed", error: msg.slice(0, 500) })
      .onConflictDoUpdate({ target: [providerWebhookEvents.provider, providerWebhookEvents.eventId], set: { status: "failed", error: msg.slice(0, 500) } });
    throw e;
  }
}

async function setIntentStatus(tx: Tx, pi: typeof paymentIntents.$inferSelect, to: PIStatus, sourceEventId: string, extra: Partial<typeof paymentIntents.$inferInsert> = {}) {
  if (pi.status === to) return;
  await tx.update(paymentIntents).set({ ...extra, status: to, updatedAt: new Date() }).where(eq(paymentIntents.id, pi.id));
  await tx.insert(paymentEvents).values({ paymentIntentId: pi.id, fromStatus: pi.status, toStatus: to, sourceEventId });
}

async function findIntent(tx: Tx, provider: string, checkoutRef: string | null, paymentRef: string | null) {
  if (checkoutRef) {
    const [pi] = await tx.select().from(paymentIntents).where(and(eq(paymentIntents.provider, provider), eq(paymentIntents.providerRef, checkoutRef))).for("update");
    if (pi) return pi;
  }
  if (paymentRef) {
    const [pi] = await tx.select().from(paymentIntents).where(and(eq(paymentIntents.provider, provider), eq(paymentIntents.providerPaymentRef, paymentRef))).for("update");
    if (pi) return pi;
  }
  return null;
}

async function apply(tx: Tx, provider: string, ev: NormalizedPaymentEvent): Promise<"processed" | "ignored"> {
  switch (ev.kind) {
    case "ignored":
      return "ignored";

    case "checkout.completed": {
      const pi = await findIntent(tx, provider, ev.checkoutRef, ev.paymentRef);
      if (!pi) throw new Error(`Unknown checkout ${ev.checkoutRef}`);
      if (ev.amountMinor !== pi.amountMinor || ev.currency !== pi.currency) {
        throw new Error(`Amount mismatch for intent ${pi.id}: expected ${pi.amountMinor} ${pi.currency}, got ${ev.amountMinor} ${ev.currency}`);
      }
      await setIntentStatus(tx, pi, "succeeded", ev.eventId, { providerPaymentRef: ev.paymentRef ?? pi.providerPaymentRef });
      await tx.update(orders).set({ status: "paid", updatedAt: new Date() }).where(eq(orders.id, pi.orderId));
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, pi.orderId));
      for (const item of items) {
        if (item.kind === "booking" && item.bookingId) await confirmPaidBooking(tx, item.bookingId, pi, ev.eventId);
        if (item.kind === "course" && item.courseId) {
          const [o] = await tx.select().from(orders).where(eq(orders.id, pi.orderId));
          await tx.insert(courseEnrollments).values({ courseId: item.courseId, userId: o.buyerId, source: "order", orderId: o.id }).onConflictDoNothing();
        }
      }
      return "processed";
    }

    case "checkout.expired":
    case "payment.failed": {
      const pi = await findIntent(tx, provider, ev.checkoutRef, ev.kind === "payment.failed" ? ev.paymentRef : null);
      if (!pi) return "ignored";
      if (pi.status === "succeeded") return "ignored"; // never downgrade a verified success
      await setIntentStatus(tx, pi, ev.kind === "checkout.expired" ? "canceled" : "failed", ev.eventId);
      await tx.update(orders).set({ status: ev.kind === "checkout.expired" ? "canceled" : "failed", updatedAt: new Date() }).where(eq(orders.id, pi.orderId));
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, pi.orderId));
      for (const item of items) {
        if (!item.bookingId) continue;
        const [b] = await tx.select().from(bookings).where(eq(bookings.id, item.bookingId)).for("update");
        const to: BookingStatus = ev.kind === "checkout.expired" ? "expired" : "payment_failed";
        if (b && canTransition(b.status, to, "provider")) {
          await transition(tx, b, to, "provider", null, { reason: ev.kind, metadata: { eventId: ev.eventId }, patch: { paymentStatus: ev.kind === "checkout.expired" ? "canceled" : "failed", holdExpiresAt: null } });
          await notify(tx, { userId: b.studentId, kind: "payment_failed", title: ev.kind === "checkout.expired" ? "Checkout expired" : "Payment failed", body: "Your lesson was not booked and you were not charged by ClassBridge.", link: `/lessons/${b.id}`, dedupeKey: `payment_failed:${b.id}` });
        }
      }
      return "processed";
    }

    case "refund.succeeded":
    case "refund.failed": {
      const [r] = await tx.select().from(refunds).where(and(eq(refunds.provider, provider), eq(refunds.providerRef, ev.refundRef))).for("update");
      if (!r) return "ignored";
      if (ev.kind === "refund.failed") {
        await tx.update(refunds).set({ status: "failed", lastError: ev.message ?? "Provider reported refund failure", updatedAt: new Date() }).where(eq(refunds.id, r.id));
        await audit(tx, { actorId: null, action: "refund.failed", targetType: "refund", targetId: r.id, reason: ev.message });
        return "processed";
      }
      if (r.status === "succeeded") return "processed";
      await tx.update(refunds).set({ status: "succeeded", updatedAt: new Date() }).where(eq(refunds.id, r.id));
      const [pi] = await tx.select().from(paymentIntents).where(eq(paymentIntents.id, r.paymentIntentId)).for("update");
      const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${refunds.amountMinor}),0)::int` }).from(refunds).where(and(eq(refunds.paymentIntentId, pi.id), eq(refunds.status, "succeeded")));
      const full = total >= pi.amountMinor;
      await setIntentStatus(tx, pi, full ? "refunded" : "partially_refunded", ev.eventId);
      await tx.update(orders).set({ status: full ? "refunded" : "partially_refunded", updatedAt: new Date() }).where(eq(orders.id, pi.orderId));
      if (r.bookingId) {
        const [b] = await tx.select().from(bookings).where(eq(bookings.id, r.bookingId)).for("update");
        if (b) {
          // Reverse the teacher's earning proportionally; the platform fee share is returned too.
          const feeShare = b.priceMinor ? Math.floor((b.platformFeeMinor * r.amountMinor) / b.priceMinor) : 0;
          await tx.insert(teacherLedgerEntries).values([
            { teacherId: b.teacherId, bookingId: b.id, orderId: pi.orderId, kind: "refund_reversal", amountMinor: -r.amountMinor, currency: r.currency, sourceRef: `refund:${r.id}` },
            { teacherId: b.teacherId, bookingId: b.id, orderId: pi.orderId, kind: "fee_reversal", amountMinor: feeShare, currency: r.currency, sourceRef: `refund:${r.id}` },
          ]).onConflictDoNothing();
          if (canTransition(b.status, "refunded", "provider")) {
            await transition(tx, b, "refunded", "provider", null, { reason: "refund_succeeded", metadata: { eventId: ev.eventId, refundId: r.id }, patch: { paymentStatus: full ? "refunded" : "partially_refunded" } });
          }
          await notify(tx, { userId: b.studentId, kind: "refund_succeeded", title: "Refund completed", body: "Your refund was confirmed by the payment provider.", link: `/lessons/${b.id}`, dedupeKey: `refund_succeeded:${r.id}` });
        }
      }
      return "processed";
    }

    case "dispute.created": {
      const pi = await findIntent(tx, provider, null, ev.paymentRef);
      if (!pi) return "ignored";
      await setIntentStatus(tx, pi, "disputed", ev.eventId);
      await audit(tx, { actorId: null, action: "payment.disputed", targetType: "payment_intent", targetId: pi.id });
      return "processed";
    }
  }
}

async function confirmPaidBooking(tx: Tx, bookingId: string, pi: typeof paymentIntents.$inferSelect, eventId: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update");
  if (!b) throw new Error(`Booking ${bookingId} missing`);
  const [t] = await tx.select({ userId: teacherProfiles.userId }).from(teacherProfiles).where(eq(teacherProfiles.id, b.teacherId));
  if (b.status === "confirmed") return; // already applied by an equivalent event
  if (b.status === "awaiting_payment" || b.status === "slot_held") {
    if (b.status === "slot_held") await transition(tx, b, "awaiting_payment", "system", null, { reason: "late_checkout_link" });
    await transition(tx, { id: b.id, status: "awaiting_payment" }, "confirmed", "provider", null, {
      reason: "payment_succeeded", metadata: { eventId, paymentIntentId: pi.id }, patch: { paymentStatus: "succeeded", holdExpiresAt: null },
    });
    // Append-only ledger; unique (source_ref, kind, teacher) makes replays harmless.
    await tx.insert(teacherLedgerEntries).values([
      { teacherId: b.teacherId, bookingId: b.id, orderId: pi.orderId, kind: "lesson_earning", amountMinor: b.priceMinor, currency: b.currency, sourceRef: `booking:${b.id}:payment` },
      { teacherId: b.teacherId, bookingId: b.id, orderId: pi.orderId, kind: "platform_fee", amountMinor: -b.platformFeeMinor, currency: b.currency, sourceRef: `booking:${b.id}:payment` },
    ]).onConflictDoNothing();
    await notifyConfirmed(tx, { ...b, status: "confirmed" }, t.userId);
    return;
  }
  // Payment arrived for a booking that is no longer holdable (expired / cancelled): record + queue a refund for staff.
  await tx.update(bookings).set({ paymentStatus: "succeeded", updatedAt: new Date() }).where(eq(bookings.id, b.id));
  await tx.insert(refunds).values({
    paymentIntentId: pi.id, bookingId: b.id, provider: pi.provider, amountMinor: pi.amountMinor, currency: pi.currency,
    reason: `late_payment_for_${b.status}_booking`, requestedBy: b.studentId,
  });
  await audit(tx, { actorId: null, action: "payment.late_for_unavailable_booking", targetType: "booking", targetId: b.id, metadata: { status: b.status, eventId } });
  await notify(tx, { userId: b.studentId, kind: "payment_needs_refund", title: "Payment received after your hold expired", body: "The time is no longer reserved. A full refund has been queued.", link: `/lessons/${b.id}`, dedupeKey: `late_payment:${b.id}` });
  await enqueueEmail(tx, { to: (await tx.select({ e: users.email }).from(users).where(eq(users.id, b.studentId)))[0].e, userId: b.studentId, template: "late_payment",
    subject: "Your ClassBridge payment will be refunded", body: `Your payment arrived after the reserved time expired. A full refund has been queued. Details: ${env().APP_URL}/lessons/${b.id}`, idempotencyKey: `late_payment:${b.id}` });
}
