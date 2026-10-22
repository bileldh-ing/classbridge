/**
 * Rescheduling a confirmed 1:1 lesson. The move is a single UPDATE of (starts_at, ends_at) inside a transaction that
 * holds the teacher's advisory lock: the old range is released and the new one held atomically, and the
 * `bookings_teacher_no_overlap` / `bookings_student_no_overlap` exclusion constraints still guard against any race.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { DateTime } from "luxon";
import type { DB } from "../db";
import { bookingEvents, bookings, profiles, teacherProfiles, users } from "../db/schema";
import { AppError, pgCode, PG_EXCLUSION_VIOLATION } from "../errors";
import { bookingActorFor, type Principal } from "../auth/permissions";
import { computeSlots } from "./teachers";
import { notify } from "./notify";
import { enqueueEmail } from "../email/outbox";
import { env } from "../env";

export const RESCHEDULE_POLICY = { studentMinNoticeHours: 24, teacherMinNoticeHours: 2, maxReschedules: 2 } as const;

export const rescheduleSchema = z.object({ startsAt: z.coerce.date(), reason: z.string().trim().min(3).max(500) });

/** Policy check, pure (unit-tested). Returns an error message or null. */
export function reschedulePolicyError(input: { who: "student" | "teacher" | "admin"; status: string; startsAt: Date; rescheduleCount: number; isGroup: boolean; now: Date }): string | null {
  if (input.isGroup) return "Group lesson seats cannot be rescheduled; cancel and book another session instead.";
  if (input.status !== "confirmed") return `Only confirmed lessons can be rescheduled (this one is ${input.status.replace(/_/g, " ")}).`;
  if (input.rescheduleCount >= RESCHEDULE_POLICY.maxReschedules) return `A lesson can be rescheduled at most ${RESCHEDULE_POLICY.maxReschedules} times.`;
  const hoursLeft = (input.startsAt.getTime() - input.now.getTime()) / 3_600_000;
  const min = input.who === "student" ? RESCHEDULE_POLICY.studentMinNoticeHours : input.who === "teacher" ? RESCHEDULE_POLICY.teacherMinNoticeHours : 0;
  if (hoursLeft < min) return `Lessons can be rescheduled up to ${min} hours before the start.`;
  return null;
}

export async function rescheduleBooking(db: DB, actor: Principal, bookingId: string, input: z.infer<typeof rescheduleSchema>, now = new Date()) {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select({ b: bookings, teacherUserId: teacherProfiles.userId }).from(bookings)
        .innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId)).where(eq(bookings.id, bookingId));
      const who = row ? bookingActorFor(actor, { studentId: row.b.studentId, teacherUserId: row.teacherUserId }) : null;
      if (!row || !who) throw new AppError("NOT_FOUND", "Booking not found.");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${row.b.teacherId}))`);
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update");
      const err = reschedulePolicyError({ who, status: b.status, startsAt: b.startsAt, rescheduleCount: b.rescheduleCount, isGroup: !!b.groupSessionId, now });
      if (err) throw new AppError("NOT_ELIGIBLE", err);
      const durationMs = b.endsAt.getTime() - b.startsAt.getTime();
      const start = input.startsAt;
      if (start.getTime() === b.startsAt.getTime()) throw new AppError("VALIDATION_FAILED", "Pick a different time.");
      const end = new Date(start.getTime() + durationMs);
      const { slots } = await computeSlots(tx, b.offeringId, new Date(start.getTime() - 1), new Date(end.getTime() + 1), now, { excludeBookingId: b.id });
      if (!slots.some((s) => s.getTime() === start.getTime())) throw new AppError("SLOT_UNAVAILABLE", "This time is not available.");
      const updated = await tx.update(bookings).set({ startsAt: start, endsAt: end, rescheduleCount: b.rescheduleCount + 1, updatedAt: new Date() })
        .where(and(eq(bookings.id, b.id), eq(bookings.status, "confirmed"))).returning({ id: bookings.id });
      if (!updated.length) throw new AppError("CONFLICT", "Booking changed concurrently; reload and try again.");
      await tx.insert(bookingEvents).values({ bookingId: b.id, fromStatus: "confirmed", toStatus: "confirmed", actorId: actor.id, actorRole: who, reason: `rescheduled: ${input.reason}`,
        metadata: { from: b.startsAt.toISOString(), to: start.toISOString() } });
      const other = who === "student" ? row.teacherUserId : b.studentId;
      const [o] = await tx.select({ email: users.email, tz: profiles.timezone }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, other));
      const when = DateTime.fromJSDate(start, { zone: o.tz }).toFormat("cccc d LLLL yyyy, HH:mm ZZZZ");
      const link = other === b.studentId ? `/lessons/${b.id}` : `/teach/bookings/${b.id}`;
      await notify(tx, { userId: other, kind: "booking_rescheduled", title: "Lesson rescheduled", body: `New time: ${when}. Reason: ${input.reason}`, link, dedupeKey: `booking_rescheduled:${b.id}:${b.rescheduleCount + 1}` });
      await enqueueEmail(tx, { to: o.email, userId: other, template: "booking_rescheduled", subject: "Your ClassBridge lesson was rescheduled",
        body: `Your lesson was moved to ${when}.\nReason: ${input.reason}\n${env().APP_URL}${link}`, idempotencyKey: `booking_rescheduled:${b.id}:${b.rescheduleCount + 1}` });
      return { id: b.id, startsAt: start, endsAt: end, rescheduleCount: b.rescheduleCount + 1 };
    });
  } catch (e) {
    if (pgCode(e) === PG_EXCLUSION_VIOLATION) throw new AppError("SLOT_UNAVAILABLE", "That time overlaps another lesson.");
    throw e;
  }
}
