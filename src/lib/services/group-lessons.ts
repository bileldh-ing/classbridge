/**
 * Group lessons (behind the `group_lessons` flag). A teacher schedules a session for a published group offering;
 * students book seats. Capacity is enforced by counting active seats while the session row is locked FOR UPDATE,
 * and a partial unique index prevents the same student holding two seats. Sessions cannot overlap each other
 * (exclusion constraint) or the teacher's 1:1 bookings (checked under the teacher advisory lock; 1:1 slot computation
 * treats sessions as busy).
 */
import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db";
import { bookingEvents, bookings, groupSessions, lessonOfferings, teacherProfiles } from "../db/schema";
import { AppError, pgCode, PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION } from "../errors";
import type { Principal } from "../auth/permissions";
import { requireFlag } from "./flags";
import { requireTeacher } from "./teachers";
import { randomToken } from "../crypto";
import { platformFee } from "../money";
import { env } from "../env";
import { isValidTimezone } from "../scheduling/slots";
import { expireStaleHolds } from "./bookings";

const SEAT_STATUSES = ["slot_held", "awaiting_payment", "confirmed", "in_progress"] as const;

export const groupSessionSchema = z.object({ offeringId: z.string().uuid(), startsAt: z.coerce.date() });

export async function createGroupSession(db: DB, actor: Principal, input: z.infer<typeof groupSessionSchema>, now = new Date()) {
  await requireFlag(db, "group_lessons", "Group lessons");
  const t = await requireTeacher(db, actor.id);
  try {
    return await db.transaction(async (tx) => {
      const [o] = await tx.select().from(lessonOfferings).where(and(eq(lessonOfferings.id, input.offeringId), eq(lessonOfferings.teacherId, t.id)));
      if (!o) throw new AppError("NOT_FOUND", "Offering not found.");
      if (o.type !== "group" || o.status !== "published") throw new AppError("NOT_ELIGIBLE", "Sessions can only be scheduled for a published group offering.");
      if (o.capacity < 2) throw new AppError("VALIDATION_FAILED", "A group offering needs a capacity of at least 2.");
      if (input.startsAt.getTime() < now.getTime() + t.minNoticeMinutes * 60_000) throw new AppError("VALIDATION_FAILED", "Sessions must respect your minimum notice.");
      const endsAt = new Date(input.startsAt.getTime() + o.durationMinutes * 60_000);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${t.id}))`);
      const [clash] = await tx.select({ id: bookings.id }).from(bookings).where(and(
        eq(bookings.teacherId, t.id), isNull(bookings.groupSessionId), inArray(bookings.status, [...SEAT_STATUSES]),
        lt(bookings.startsAt, endsAt), gt(bookings.endsAt, input.startsAt),
      )).limit(1);
      if (clash) throw new AppError("SLOT_UNAVAILABLE", "You already have a lesson at this time.");
      const [s] = await tx.insert(groupSessions).values({ teacherId: t.id, offeringId: o.id, startsAt: input.startsAt, endsAt, capacity: o.capacity, roomName: `cbg-${randomToken(16)}` }).returning();
      return s;
    });
  } catch (e) {
    if (pgCode(e) === PG_EXCLUSION_VIOLATION) throw new AppError("SLOT_UNAVAILABLE", "This session overlaps another of your group sessions.");
    throw e;
  }
}

/** Upcoming scheduled sessions for a teacher with seats taken (public). */
export async function listGroupSessions(db: DB, teacherId: string, now = new Date()) {
  const rows = await db.select({
    s: groupSessions, title: lessonOfferings.title, priceMinor: lessonOfferings.priceMinor, currency: lessonOfferings.currency,
    seatsTaken: sql<number>`(SELECT count(*)::int FROM bookings b WHERE b.group_session_id = ${groupSessions.id}
      AND b.status IN ('slot_held','awaiting_payment','confirmed','in_progress')
      AND NOT (b.status IN ('slot_held','awaiting_payment') AND b.hold_expires_at < now()))`,
  }).from(groupSessions).innerJoin(lessonOfferings, eq(lessonOfferings.id, groupSessions.offeringId))
    .where(and(eq(groupSessions.teacherId, teacherId), eq(groupSessions.status, "scheduled"), gt(groupSessions.startsAt, now)))
    .orderBy(asc(groupSessions.startsAt)).limit(50);
  return rows.map((r) => ({ ...r.s, title: r.title, priceMinor: r.priceMinor, currency: r.currency, seatsTaken: r.seatsTaken, seatsLeft: Math.max(0, r.s.capacity - r.seatsTaken) }));
}

export const seatSchema = z.object({ timezone: z.string().max(64).refine(isValidTimezone, "invalid_timezone") });

export async function bookGroupSeat(db: DB, actor: Principal, sessionId: string, input: z.infer<typeof seatSchema>, now = new Date()) {
  await requireFlag(db, "group_lessons", "Group lessons");
  try {
    return await db.transaction(async (tx) => {
      const [s] = await tx.select().from(groupSessions).where(eq(groupSessions.id, sessionId)).for("update");
      if (!s || s.status !== "scheduled") throw new AppError("NOT_FOUND", "Session not found.");
      if (s.startsAt <= now) throw new AppError("NOT_ELIGIBLE", "This session has already started.");
      const [row] = await tx.select({ o: lessonOfferings, t: teacherProfiles }).from(lessonOfferings).innerJoin(teacherProfiles, eq(teacherProfiles.id, lessonOfferings.teacherId)).where(eq(lessonOfferings.id, s.offeringId));
      if (row.t.publishState !== "published" || row.o.status !== "published") throw new AppError("NOT_FOUND", "Session not found.");
      if (row.t.userId === actor.id) throw new AppError("NOT_ELIGIBLE", "You cannot book your own session.");
      // Release expired holds on this session before counting.
      const stale = await tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.groupSessionId, s.id), inArray(bookings.status, ["slot_held", "awaiting_payment"]), lt(bookings.holdExpiresAt, now)));
      if (stale.length) await expireStaleHolds(tx, { teacherId: s.teacherId });
      const [mine] = await tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.groupSessionId, s.id), eq(bookings.studentId, actor.id), inArray(bookings.status, [...SEAT_STATUSES])));
      if (mine) throw new AppError("CONFLICT", "You already hold a seat in this session.");
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(bookings).where(and(eq(bookings.groupSessionId, s.id), inArray(bookings.status, [...SEAT_STATUSES])));
      if (n >= s.capacity) throw new AppError("SLOT_UNAVAILABLE", "This group session is full.");
      const [b] = await tx.insert(bookings).values({
        studentId: actor.id, teacherId: s.teacherId, offeringId: s.offeringId, groupSessionId: s.id, startsAt: s.startsAt, endsAt: s.endsAt,
        studentTimezone: input.timezone, mode: row.o.mode, status: "slot_held", paymentStatus: row.o.priceMinor === 0 ? "not_required" : "created",
        priceMinor: row.o.priceMinor, currency: row.o.currency, platformFeeMinor: platformFee(row.o.priceMinor, env().PLATFORM_FEE_BPS),
        cancellationPolicy: row.o.cancellationPolicy, holdExpiresAt: new Date(now.getTime() + env().BOOKING_HOLD_MINUTES * 60_000), roomName: `cb-${randomToken(16)}`,
      }).returning();
      await tx.insert(bookingEvents).values({ bookingId: b.id, fromStatus: "draft", toStatus: "slot_held", actorId: actor.id, actorRole: "student", reason: "group_seat_selected", metadata: { groupSessionId: s.id } });
      return b;
    });
  } catch (e) {
    const code = pgCode(e);
    if (code === PG_UNIQUE_VIOLATION) throw new AppError("CONFLICT", "You already hold a seat in this session.");
    if (code === PG_EXCLUSION_VIOLATION) throw new AppError("SLOT_UNAVAILABLE", "This overlaps another lesson of yours.");
    throw e;
  }
}
