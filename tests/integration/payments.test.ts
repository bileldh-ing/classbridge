import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb } from "@/lib/db";
import { bookings, notifications, orders, paymentIntents, providerWebhookEvents, refunds, teacherLedgerEntries, emailOutbox } from "@/lib/db/schema";
import { cancelBooking, createBooking, startCheckout, submitRefund } from "@/lib/services/bookings";
import { handleProviderEvent } from "@/lib/payments/webhooks";
import { db, futureHour, makeTeacher, makeUser, resetDb } from "../helpers";
import { FakeStripe, checkoutCompleted, signedEvent, simpleEvent } from "../fake-stripe";

beforeEach(resetDb);
afterAll(closeDb);

async function deliver(p: FakeStripe, event: object) {
  const { payload, header } = signedEvent(event);
  const raw = p.verifyWebhook(payload, header);
  return handleProviderEvent(db(), p.name, raw, p.normalize(raw));
}

async function paidBookingAwaitingPayment(hoursAhead = 72) {
  const t = await makeTeacher({ priceMinor: 3000 });
  const s = await makeUser();
  const p = new FakeStripe();
  const b = await createBooking(db(), s, { offeringId: t.offering.id, startsAt: futureHour(hoursAhead), timezone: "UTC" });
  await startCheckout(db(), s, b.id, p);
  const [pi] = await db().select().from(paymentIntents);
  return { ...t, s, p, b, pi };
}

describe("checkout through the payment adapter", () => {
  it("unconfigured provider: honest error, nothing charged, booking still held", async () => {
    const t = await makeTeacher({ priceMinor: 3000 });
    const s = await makeUser();
    const b = await createBooking(db(), s, { offeringId: t.offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await expect(startCheckout(db(), s, b.id, null)).rejects.toMatchObject({ code: "PAYMENT_PROVIDER_NOT_CONFIGURED" });
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("slot_held");
    expect(await db().select().from(orders)).toHaveLength(0);
  });

  it("starting checkout moves the booking to awaiting_payment but does NOT confirm it", async () => {
    const { b } = await paidBookingAwaitingPayment();
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("awaiting_payment");
    expect(row.paymentStatus).toBe("requires_action");
  });
});

describe("webhook idempotency & state", () => {
  it("verified success confirms the booking once; replays do not duplicate ledger, notifications or emails", async () => {
    const { p, b, pi } = await paidBookingAwaitingPayment();
    const ev = checkoutCompleted("evt_success_1", pi.providerRef!, 3000);
    expect((await deliver(p, ev)).status).toBe("processed");
    expect((await deliver(p, ev)).status).toBe("duplicate");
    expect((await deliver(p, ev)).status).toBe("duplicate");
    // a different event id for the same session (e.g. async_payment_succeeded) is also harmless
    expect((await deliver(p, { ...ev, id: "evt_success_2", type: "checkout.session.async_payment_succeeded" })).status).toBe("processed");

    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("confirmed");
    expect(row.paymentStatus).toBe("succeeded");
    const ledger = await db().select().from(teacherLedgerEntries);
    expect(ledger.map((l) => [l.kind, l.amountMinor]).sort()).toEqual([["lesson_earning", 3000], ["platform_fee", -450]]);
    const notes = await db().select().from(notifications).where(sql`${notifications.kind} = 'booking_confirmed'`);
    expect(notes).toHaveLength(2);
    const emails = await db().select().from(emailOutbox).where(eq(emailOutbox.template, "booking_confirmed"));
    expect(emails).toHaveLength(2);
    const [o] = await db().select().from(orders);
    expect(o.status).toBe("paid");
  });

  it("failed payment does not confirm the lesson", async () => {
    const { p, b, pi } = await paidBookingAwaitingPayment();
    await deliver(p, simpleEvent("evt_fail", "checkout.session.async_payment_failed", { id: pi.providerRef, payment_intent: "pi_x" }));
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("payment_failed");
    expect(await db().select().from(teacherLedgerEntries)).toHaveLength(0);
    // a later (out-of-order) success event for a failed booking does not resurrect it silently
  });

  it("expired checkout releases the slot", async () => {
    const { p, b, pi } = await paidBookingAwaitingPayment();
    await deliver(p, simpleEvent("evt_exp", "checkout.session.expired", { id: pi.providerRef }));
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("expired");
  });

  it("amount mismatch is rejected, recorded as failed, and can be retried", async () => {
    const { p, b, pi } = await paidBookingAwaitingPayment();
    await expect(deliver(p, checkoutCompleted("evt_bad_amount", pi.providerRef!, 1))).rejects.toThrow(/Amount mismatch/);
    const [w] = await db().select().from(providerWebhookEvents).where(eq(providerWebhookEvents.eventId, "evt_bad_amount"));
    expect(w.status).toBe("failed");
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("awaiting_payment");
  });

  it("success arriving after the booking expired queues a refund instead of confirming", async () => {
    const { p, b, pi } = await paidBookingAwaitingPayment();
    await deliver(p, simpleEvent("evt_exp2", "checkout.session.expired", { id: "cs_other" })); // unrelated, ignored
    await db().execute(sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${b.id}`);
    const { expireStaleHolds } = await import("@/lib/services/bookings");
    await expireStaleHolds(db());
    await deliver(p, checkoutCompleted("evt_late", pi.providerRef!, 3000));
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("expired");
    const rs = await db().select().from(refunds);
    expect(rs).toHaveLength(1);
    expect(rs[0].status).toBe("requested");
  });
});

describe("refunds follow the provider", () => {
  it("cancellation ≥24h → refund_pending → provider confirms → refunded with ledger reversal", async () => {
    const { p, b, pi, s } = await paidBookingAwaitingPayment(96);
    await deliver(p, checkoutCompleted("evt_ok", pi.providerRef!, 3000));
    const r = await cancelBooking(db(), s, b.id, "cannot attend", p);
    expect(r.status).toBe("refund_pending");
    const [rf] = await db().select().from(refunds);
    expect(rf.status).toBe("pending");
    expect(p.refundsCreated[0].amountMinor).toBe(3000);
    // local state does not claim success until the provider says so
    let [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("refund_pending");
    await deliver(p, simpleEvent("evt_refund", "refund.updated", { id: rf.providerRef, status: "succeeded", amount: 3000 }));
    await deliver(p, simpleEvent("evt_refund", "refund.updated", { id: rf.providerRef, status: "succeeded", amount: 3000 }));
    [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("refunded");
    const ledger = await db().select().from(teacherLedgerEntries);
    const net = ledger.reduce((a, l) => a + l.amountMinor, 0);
    expect(net).toBe(0);
    expect(ledger).toHaveLength(4);
  });

  it("provider refund failure is visible and retryable", async () => {
    const { p, b, pi, s } = await paidBookingAwaitingPayment(96);
    await deliver(p, checkoutCompleted("evt_ok2", pi.providerRef!, 3000));
    p.failRefund = true;
    await cancelBooking(db(), s, b.id, "cannot attend", p);
    let [rf] = await db().select().from(refunds);
    expect(rf.status).toBe("failed");
    expect(rf.lastError).toMatch(/simulated provider error/);
    p.failRefund = false;
    await submitRefund(db(), rf.id, p);
    [rf] = await db().select().from(refunds);
    expect(rf.status).toBe("pending");
  });

  it("late cancellation under flex policy refunds nothing", async () => {
    const { p, b, pi, s } = await paidBookingAwaitingPayment(5);
    await deliver(p, checkoutCompleted("evt_ok3", pi.providerRef!, 3000));
    const r = await cancelBooking(db(), s, b.id, "late cancel", p);
    expect(r.status).toBe("canceled_by_student");
    expect(await db().select().from(refunds)).toHaveLength(0);
  });

  it("ledger is append-only", async () => {
    const { p, pi } = await paidBookingAwaitingPayment();
    await deliver(p, checkoutCompleted("evt_ok4", pi.providerRef!, 3000));
    await expect(db().execute(sql`UPDATE teacher_ledger_entries SET amount_minor = 999999`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
  });
});
