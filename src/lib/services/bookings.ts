/**
 * Booking lifecycle service. Every status change goes through `transition()`, which enforces the
 * state machine + actor permission, uses a compare-and-set UPDATE, and appends a booking_events row.
 * Double-booking is prevented by the `bookings_teacher_no_overlap` exclusion constraint.
 */
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { DateTime } from "luxon";
import type { DB, DbOrTx } from "../db";
import {
  attendanceRecords, bookingEvents, bookings, lessonNotes, lessonOfferings, orderItems, orders, paymentIntents,
  profiles, refunds, teacherLocations, teacherProfiles, users,
} from "../db/schema";
import { AppError, pgCode, PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION } from "../errors";
import { canTransition, type Actor, type BookingStatus } from "../booking/state-machine";
import { canViewBooking, bookingActorFor, type Principal } from "../auth/permissions";
import { computeSlots } from "./teachers";
import { platformFee } from "../money";
import { env } from "../env";
import { randomToken } from "../crypto";
import { notify } from "./notify";
import { enqueueEmail } from "../email/outbox";
import { refundableAmount } from "../policy/cancellation";
import { isValidTimezone } from "../scheduling/slots";
import type { PaymentProvider } from "../payments/provider";
import { rateLimit } from "./rate-limit";

type Booking = typeof bookings.$inferSelect;

export const JOIN_EARLY_MINUTES = 10;
export const JOIN_LATE_MINUTES = 15;

export async function transition(
  tx: DbOrTx, b: Pick<Booking, "id" | "status">, to: BookingStatus, actor: Actor, actorId: string | null,
  opts: { reason?: string; metadata?: Record<string, unknown>; patch?: Partial<typeof bookings.$inferInsert> } = {},
) {
  if (!canTransition(b.status, to, actor)) {
    throw new AppError("INVALID_TRANSITION", `Cannot move booking from ${b.status} to ${to} as ${actor}.`);
  }
  const updated = await tx.update(bookings).set({ ...opts.patch, status: to, updatedAt: new Date() })
    .where(and(eq(bookings.id, b.id), eq(bookings.status, b.status))).returning({ id: bookings.id });
  if (!updated.length) throw new AppError("CONFLICT", "Booking changed concurrently; reload and try again.");
  await tx.insert(bookingEvents).values({
    bookingId: b.id, fromStatus: b.status, toStatus: to, actorId, actorRole: actor, reason: opts.reason ?? null, metadata: opts.metadata ?? {},
  });
}

/** Lazily expires stale holds (also run by the job runner). Returns number expired. */
export async function expireStaleHolds(tx: DbOrTx, filter?: { teacherId?: string; studentId?: string }) {
  const conds = [inArray(bookings.status, ["slot_held", "awaiting_payment"] as BookingStatus[]), lt(bookings.holdExpiresAt, new Date())];
  if (filter?.teacherId || filter?.studentId) {
    conds.push(or(
      filter.teacherId ? eq(bookings.teacherId, filter.teacherId) : sql`false`,
      filter.studentId ? eq(bookings.studentId, filter.studentId) : sql`false`,
    )!);
  }
  const stale = await tx.select({ id: bookings.id, status: bookings.status }).from(bookings).where(and(...conds)).for("update", { skipLocked: true });
  for (const b of stale) await transition(tx, b, "expired", "system", null, { reason: "hold_expired" });
  return stale.length;
}

export const createBookingSchema = z.object({
  offeringId: z.string().uuid(),
  startsAt: z.coerce.date(),
  timezone: z.string().max(64).refine(isValidTimezone, "invalid_timezone"),
  intakeAnswer: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export async function createBooking(db: DB, actor: Principal, input: z.infer<typeof createBookingSchema>, now = new Date()) {
  const rl = await rateLimit(db, `booking:create:${actor.id}`, 20, 3600);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many booking attempts. Try again later.");
  if (input.idempotencyKey) {
    const [existing] = await db.select().from(bookings).where(and(eq(bookings.studentId, actor.id), eq(bookings.idempotencyKey, input.idempotencyKey)));
    if (existing) return existing;
  }
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select({ o: lessonOfferings, t: teacherProfiles }).from(lessonOfferings)
        .innerJoin(teacherProfiles, eq(teacherProfiles.id, lessonOfferings.teacherId)).where(eq(lessonOfferings.id, input.offeringId));
      if (!row || row.o.status !== "published" || row.t.publishState !== "published") throw new AppError("NOT_FOUND", "This lesson is not available.");
      if (row.t.userId === actor.id) throw new AppError("NOT_ELIGIBLE", "You cannot book your own lesson.");
      if (row.o.type === "group") throw new AppError("NOT_ELIGIBLE", "Group lessons are booked by choosing a scheduled session.");
      // Serialise slot decisions per teacher (1:1 bookings, reschedules and group sessions share this lock).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${row.t.id}))`);
      await expireStaleHolds(tx, { teacherId: row.t.id, studentId: actor.id });
      const start = input.startsAt;
      const end = new Date(start.getTime() + row.o.durationMinutes * 60_000);
      const { slots } = await computeSlots(tx, row.o.id, new Date(start.getTime() - 1), new Date(end.getTime() + 1), now);
      if (!slots.some((s) => s.getTime() === start.getTime())) throw new AppError("SLOT_UNAVAILABLE", "This time is no longer available.");
      const [b] = await tx.insert(bookings).values({
        studentId: actor.id, teacherId: row.t.id, offeringId: row.o.id, startsAt: start, endsAt: end,
        studentTimezone: input.timezone, mode: row.o.mode, status: "slot_held",
        paymentStatus: row.o.priceMinor === 0 ? "not_required" : "created",
        priceMinor: row.o.priceMinor, currency: row.o.currency, platformFeeMinor: platformFee(row.o.priceMinor, env().PLATFORM_FEE_BPS),
        cancellationPolicy: row.o.cancellationPolicy, holdExpiresAt: new Date(now.getTime() + env().BOOKING_HOLD_MINUTES * 60_000),
        roomName: `cb-${randomToken(16)}`, intakeAnswer: input.intakeAnswer ?? null, idempotencyKey: input.idempotencyKey ?? null,
      }).returning();
      await tx.insert(bookingEvents).values({ bookingId: b.id, fromStatus: "draft", toStatus: "slot_held", actorId: actor.id, actorRole: "student", reason: "slot_selected" });
      return b;
    });
  } catch (e) {
    const code = pgCode(e);
    if (code === PG_EXCLUSION_VIOLATION) throw new AppError("SLOT_UNAVAILABLE", "Someone just booked this time, or it overlaps another lesson of yours.");
    if (code === PG_UNIQUE_VIOLATION && input.idempotencyKey) {
      const [existing] = await db.select().from(bookings).where(and(eq(bookings.studentId, actor.id), eq(bookings.idempotencyKey, input.idempotencyKey)));
      if (existing) return existing;
    }
    throw e;
  }
}

async function loadForActor(db: DbOrTx, actor: Principal, bookingId: string, lock = false) {
  const q = db.select({ b: bookings, teacherUserId: teacherProfiles.userId }).from(bookings)
    .innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId)).where(eq(bookings.id, bookingId));
  const [row] = lock ? await q.for("update", { of: bookings }) : await q;
  // Not found and not permitted are indistinguishable to avoid leaking booking existence.
  if (!row || !canViewBooking(actor, { studentId: row.b.studentId, teacherUserId: row.teacherUserId })) throw new AppError("NOT_FOUND", "Booking not found.");
  return row;
}

export async function notifyConfirmed(tx: DbOrTx, b: Booking, teacherUserId: string) {
  const [s] = await tx.select({ email: users.email, name: profiles.displayName, tz: profiles.timezone }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, b.studentId));
  const [t] = await tx.select({ email: users.email, name: profiles.displayName, tz: profiles.timezone }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, teacherUserId));
  const fmt = (tz: string) => DateTime.fromJSDate(b.startsAt, { zone: tz }).toFormat("cccc d LLLL yyyy, HH:mm ZZZZ");
  await notify(tx, { userId: b.studentId, kind: "booking_confirmed", title: "Lesson confirmed", body: `Your lesson with ${t.name} on ${fmt(s.tz)} is confirmed.`, link: `/lessons/${b.id}`, dedupeKey: `booking_confirmed:${b.id}` });
  await notify(tx, { userId: teacherUserId, kind: "booking_confirmed", title: "New confirmed lesson", body: `${s.name} booked a lesson on ${fmt(t.tz)}.`, link: `/teach/bookings/${b.id}`, dedupeKey: `booking_confirmed:${b.id}` });
  const base = env().APP_URL;
  await enqueueEmail(tx, { to: s.email, userId: b.studentId, template: "booking_confirmed", subject: "Your ClassBridge lesson is confirmed",
    body: `Your lesson with ${t.name} is confirmed for ${fmt(s.tz)}.\nDetails and calendar file: ${base}/lessons/${b.id}`, idempotencyKey: `booking_confirmed:student:${b.id}` });
  await enqueueEmail(tx, { to: t.email, userId: teacherUserId, template: "booking_confirmed", subject: "New lesson booked on ClassBridge",
    body: `${s.name} booked a lesson for ${fmt(t.tz)}.\nDetails: ${base}/teach/bookings/${b.id}`, idempotencyKey: `booking_confirmed:teacher:${b.id}` });
}

/** Free offerings (price 0) are confirmed without a payment provider — a valid free-booking rule, not a simulated payment. */
export async function confirmFreeBooking(db: DB, actor: Principal, bookingId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { b, teacherUserId } = await loadForActor(tx, actor, bookingId, true);
    if (b.studentId !== actor.id) throw new AppError("FORBIDDEN", "Only the student can confirm this booking.");
    if (b.priceMinor !== 0) throw new AppError("NOT_ELIGIBLE", "This lesson requires payment.");
    if (b.status !== "slot_held") throw new AppError("INVALID_TRANSITION", `Booking is ${b.status}.`);
    if (b.holdExpiresAt && b.holdExpiresAt < now) {
      await transition(tx, b, "expired", "system", null, { reason: "hold_expired" });
      throw new AppError("HOLD_EXPIRED", "Your hold on this time expired. Please pick a slot again.");
    }
    await transition(tx, b, "confirmed", "system", actor.id, { reason: "free_booking", patch: { paymentStatus: "not_required", holdExpiresAt: null } });
    await notifyConfirmed(tx, { ...b, status: "confirmed" }, teacherUserId);
    return { status: "confirmed" as const };
  });
}

/** Starts provider checkout for a paid booking. Booking/payment state only advances on verified webhooks. */
export async function startCheckout(db: DB, actor: Principal, bookingId: string, provider: PaymentProvider | null, now = new Date()) {
  const prep = await db.transaction(async (tx) => {
    const { b } = await loadForActor(tx, actor, bookingId, true);
    if (b.studentId !== actor.id) throw new AppError("FORBIDDEN", "Only the student can pay for this booking.");
    if (b.priceMinor === 0) throw new AppError("NOT_ELIGIBLE", "This lesson is free; confirm it instead.");
    if (b.status !== "slot_held") throw new AppError("INVALID_TRANSITION", `Booking is ${b.status}.`);
    if (b.holdExpiresAt && b.holdExpiresAt < now) {
      await transition(tx, b, "expired", "system", null, { reason: "hold_expired" });
      throw new AppError("HOLD_EXPIRED", "Your hold on this time expired. Please pick a slot again.");
    }
    if (!provider) throw new AppError("PAYMENT_PROVIDER_NOT_CONFIGURED", "Online payment is not configured on this ClassBridge deployment yet. No charge was made.");
    const [o] = await tx.select({ title: lessonOfferings.title }).from(lessonOfferings).where(eq(lessonOfferings.id, b.offeringId));
    const [order] = await tx.insert(orders).values({ buyerId: actor.id, totalMinor: b.priceMinor, currency: b.currency, provider: provider.name }).returning();
    await tx.insert(orderItems).values({ orderId: order.id, kind: "booking", bookingId: b.id, description: o.title, amountMinor: b.priceMinor, currency: b.currency });
    const [pi] = await tx.insert(paymentIntents).values({ orderId: order.id, provider: provider.name, amountMinor: b.priceMinor, currency: b.currency }).returning();
    const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, actor.id));
    return { b, order, pi, title: o.title, email: u.email };
  });
  let session: { providerRef: string; url: string; expiresAt: Date };
  try {
    session = await provider!.createCheckout({
      orderId: prep.order.id, paymentIntentId: prep.pi.id, amountMinor: prep.b.priceMinor, currency: prep.b.currency,
      description: prep.title, customerEmail: prep.email,
      successUrl: `${env().APP_URL}/lessons/${prep.b.id}?checkout=success`, cancelUrl: `${env().APP_URL}/lessons/${prep.b.id}/checkout?checkout=canceled`,
    });
  } catch (e) {
    await db.update(paymentIntents).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentIntents.id, prep.pi.id));
    await db.update(orders).set({ status: "failed", updatedAt: new Date() }).where(eq(orders.id, prep.order.id));
    throw new AppError("PROVIDER_ERROR", `The payment provider rejected the checkout: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  await db.transaction(async (tx) => {
    await tx.update(paymentIntents).set({ providerRef: session.providerRef, status: "requires_action", updatedAt: new Date() }).where(eq(paymentIntents.id, prep.pi.id));
    const [cur] = await tx.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.id, prep.b.id)).for("update");
    await transition(tx, cur, "awaiting_payment", "student", actor.id, {
      reason: "checkout_started", metadata: { orderId: prep.order.id, provider: provider!.name },
      // keep the slot for as long as the provider session can still complete
      patch: { holdExpiresAt: session.expiresAt, paymentStatus: "requires_action" },
    });
  });
  return { url: session.url };
}

export const cancelSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function cancelBooking(db: DB, actor: Principal, bookingId: string, reason: string, refundProvider: PaymentProvider | null, now = new Date()) {
  const result = await db.transaction(async (tx) => {
    const { b, teacherUserId } = await loadForActor(tx, actor, bookingId, true);
    const who = bookingActorFor(actor, { studentId: b.studentId, teacherUserId });
    if (!who) throw new AppError("FORBIDDEN", "Not allowed.");
    if (["slot_held", "awaiting_payment"].includes(b.status)) {
      if (who !== "student") throw new AppError("FORBIDDEN", "Only the student can release a held slot.");
      await transition(tx, b, "canceled_by_student", "student", actor.id, { reason, patch: { holdExpiresAt: null } });
      return { status: "canceled_by_student" as BookingStatus, refund: null };
    }
    if (b.status !== "confirmed") throw new AppError("INVALID_TRANSITION", `A ${b.status} booking cannot be cancelled.`);
    if (b.startsAt <= now && who !== "admin") throw new AppError("NOT_ELIGIBLE", "Lessons that have started cannot be cancelled; report a problem instead.");
    const refund = refundableAmount({ policy: b.cancellationPolicy, priceMinor: b.priceMinor, startsAt: b.startsAt, canceledAt: now, canceledBy: who });
    const paid = b.paymentStatus === "succeeded";
    const otherParty = who === "student" ? teacherUserId : b.studentId;
    await notify(tx, { userId: otherParty, kind: "booking_canceled", title: "Lesson cancelled", body: `A lesson was cancelled by the ${who}. Reason: ${reason}`, link: who === "student" ? `/teach/bookings/${b.id}` : `/lessons/${b.id}`, dedupeKey: `booking_canceled:${b.id}` });
    if (!paid || refund === 0) {
      const to: BookingStatus = who === "student" ? "canceled_by_student" : "canceled_by_teacher";
      await transition(tx, b, to, who, actor.id, { reason, metadata: { refundMinor: 0 } });
      return { status: to, refund: null };
    }
    const [pi] = await tx.select().from(paymentIntents).innerJoin(orderItems, eq(orderItems.orderId, paymentIntents.orderId))
      .where(and(eq(orderItems.bookingId, b.id), eq(paymentIntents.status, "succeeded"))).limit(1);
    if (!pi) throw new AppError("CONFLICT", "No captured payment found for this booking.");
    await transition(tx, b, "refund_pending", who, actor.id, { reason, metadata: { canceledBy: who, refundMinor: refund } });
    const [r] = await tx.insert(refunds).values({
      paymentIntentId: pi.payment_intents.id, bookingId: b.id, provider: pi.payment_intents.provider, amountMinor: refund, currency: b.currency,
      reason: `canceled_by_${who}: ${reason}`, requestedBy: actor.id,
    }).returning();
    return { status: "refund_pending" as BookingStatus, refund: r };
  });
  if (result.refund) await submitRefund(db, result.refund.id, refundProvider);
  return { status: result.status };
}

/** Sends a refund to the provider. Local status becomes `pending` until a verified webhook reports the outcome. */
export async function submitRefund(db: DB, refundId: string, provider: PaymentProvider | null) {
  const [r] = await db.select({ r: refunds, pi: paymentIntents }).from(refunds).innerJoin(paymentIntents, eq(paymentIntents.id, refunds.paymentIntentId)).where(eq(refunds.id, refundId));
  if (!r) throw new AppError("NOT_FOUND", "Refund not found");
  if (!["requested", "failed"].includes(r.r.status)) return r.r;
  if (!provider || provider.name !== r.r.provider) {
    await db.update(refunds).set({ status: "failed", lastError: "Payment provider not configured; refund could not be submitted. Retry once configured.", updatedAt: new Date() }).where(eq(refunds.id, refundId));
    return { ...r.r, status: "failed" as const };
  }
  try {
    const res = await provider.createRefund({ paymentRef: r.pi.providerPaymentRef, checkoutRef: r.pi.providerRef, amountMinor: r.r.amountMinor, idempotencyKey: `refund:${refundId}`, refundId });
    await db.update(refunds).set({ status: "pending", providerRef: res.providerRef, lastError: null, updatedAt: new Date() }).where(eq(refunds.id, refundId));
    return { ...r.r, status: "pending" as const };
  } catch (e) {
    await db.update(refunds).set({ status: "failed", lastError: String(e instanceof Error ? e.message : e).slice(0, 500), updatedAt: new Date() }).where(eq(refunds.id, refundId));
    return { ...r.r, status: "failed" as const };
  }
}

export const completeSchema = z.object({
  studentAttendance: z.enum(["present", "late", "absent"]),
  note: z.string().trim().max(4000).optional(),
  materialsUrl: z.string().url().regex(/^https:\/\//).max(500).optional().or(z.literal("")),
});

/** Teacher records attendance after the lesson start; present/late → completed, absent → no_show_student. */
export async function completeLesson(db: DB, actor: Principal, bookingId: string, input: z.infer<typeof completeSchema>, now = new Date()) {
  return db.transaction(async (tx) => {
    const { b, teacherUserId } = await loadForActor(tx, actor, bookingId, true);
    if (actor.id !== teacherUserId) throw new AppError("FORBIDDEN", "Only the teacher can record attendance.");
    if (!["confirmed", "in_progress"].includes(b.status)) throw new AppError("INVALID_TRANSITION", `Booking is ${b.status}.`);
    if (now < b.startsAt) throw new AppError("NOT_ELIGIBLE", "Attendance can be recorded once the lesson has started.");
    const to: BookingStatus = input.studentAttendance === "absent" ? "no_show_student" : "completed";
    await tx.insert(attendanceRecords).values([
      { bookingId: b.id, participantId: b.studentId, status: input.studentAttendance, markedBy: actor.id },
      { bookingId: b.id, participantId: teacherUserId, status: "present", markedBy: actor.id },
    ]).onConflictDoNothing();
    await transition(tx, b, to, "teacher", actor.id, { reason: "attendance_recorded", patch: { attendanceStatus: input.studentAttendance } });
    if (input.note) await tx.insert(lessonNotes).values({ bookingId: b.id, authorId: actor.id, body: input.note, materialsUrl: input.materialsUrl || null });
    await notify(tx, { userId: b.studentId, kind: "lesson_completed", title: to === "completed" ? "Lesson completed" : "Marked as missed",
      body: to === "completed" ? "Your teacher recorded the lesson. You can now leave a review." : "Your teacher marked you absent. Contact support if this is wrong.",
      link: `/lessons/${b.id}`, dedupeKey: `lesson_completed:${b.id}` });
    return { status: to };
  });
}

export const noteSchema = z.object({ body: z.string().trim().min(1).max(4000), materialsUrl: z.string().url().regex(/^https:\/\//).max(500).optional().or(z.literal("")) });
export async function addLessonNote(db: DB, actor: Principal, bookingId: string, input: z.infer<typeof noteSchema>) {
  const { b, teacherUserId } = await loadForActor(db, actor, bookingId);
  if (actor.id !== teacherUserId) throw new AppError("FORBIDDEN", "Only the teacher can add lesson notes.");
  if (!["in_progress", "completed", "confirmed"].includes(b.status)) throw new AppError("NOT_ELIGIBLE", "Notes can be added to confirmed or completed lessons.");
  await db.insert(lessonNotes).values({ bookingId: b.id, authorId: actor.id, body: input.body, materialsUrl: input.materialsUrl || null });
}

export async function getBookingDetail(db: DbOrTx, actor: Principal, bookingId: string) {
  const { b, teacherUserId } = await loadForActor(db, actor, bookingId);
  const [[o], [t], [sp], [tp], events, notes, [loc]] = await Promise.all([
    db.select().from(lessonOfferings).where(eq(lessonOfferings.id, b.offeringId)),
    db.select({ slug: teacherProfiles.slug, timezone: teacherProfiles.timezone }).from(teacherProfiles).where(eq(teacherProfiles.id, b.teacherId)),
    db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, b.studentId)),
    db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, teacherUserId)),
    db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, b.id)).orderBy(bookingEvents.createdAt),
    db.select().from(lessonNotes).where(eq(lessonNotes.bookingId, b.id)).orderBy(desc(lessonNotes.createdAt)),
    db.select({ city: teacherLocations.city, country: teacherLocations.country }).from(teacherLocations).where(eq(teacherLocations.teacherId, b.teacherId)),
  ]);
  const isStudent = actor.id === b.studentId;
  return {
    booking: b, offering: o, teacherSlug: t.slug, teacherTimezone: t.timezone, teacherUserId,
    studentName: sp.name, teacherName: tp.name, events,
    notes: isStudent ? notes.filter((n) => n.visibleToStudent) : notes,
    // In-person: only the city is revealed in-app; exact meeting details are arranged in messages after confirmation.
    meetingArea: b.mode === "in_person" && ["confirmed", "in_progress", "completed"].includes(b.status) ? loc ?? null : null,
    viewerRole: bookingActorFor(actor, { studentId: b.studentId, teacherUserId }),
  };
}

export async function listStudentBookings(db: DbOrTx, studentId: string) {
  return db.select({ b: bookings, teacherName: profiles.displayName, title: lessonOfferings.title, teacherSlug: teacherProfiles.slug })
    .from(bookings).innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId))
    .innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId)).innerJoin(lessonOfferings, eq(lessonOfferings.id, bookings.offeringId))
    .where(eq(bookings.studentId, studentId)).orderBy(desc(bookings.startsAt)).limit(200);
}

export async function listTeacherBookings(db: DbOrTx, teacherId: string) {
  return db.select({ b: bookings, studentName: profiles.displayName, title: lessonOfferings.title })
    .from(bookings).innerJoin(profiles, eq(profiles.userId, bookings.studentId)).innerJoin(lessonOfferings, eq(lessonOfferings.id, bookings.offeringId))
    .where(and(eq(bookings.teacherId, teacherId), sql`${bookings.status} <> 'draft'`)).orderBy(desc(bookings.startsAt)).limit(200);
}

export function joinWindow(b: Pick<Booking, "startsAt" | "endsAt">) {
  return { opensAt: new Date(b.startsAt.getTime() - JOIN_EARLY_MINUTES * 60_000), closesAt: new Date(b.endsAt.getTime() + JOIN_LATE_MINUTES * 60_000) };
}
