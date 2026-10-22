/**
 * Classroom token issuance. Order of checks: participant membership → booking state → lesson mode →
 * join window → provider configuration. Every decision is recorded in classroom_events.
 */
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { bookings, classroomEvents, groupSessions, profiles, teacherProfiles } from "../db/schema";
import { AppError } from "../errors";
import type { Principal } from "../auth/permissions";
import type { ClassroomProvider } from "../classroom/provider";
import { joinWindow, transition } from "./bookings";

export const TOKEN_TTL_SECONDS = 10 * 60;

export async function issueClassroomToken(db: DB, actor: Principal, bookingId: string, provider: ClassroomProvider | null, now = new Date()) {
  const [row] = await db.select({ b: bookings, teacherUserId: teacherProfiles.userId }).from(bookings)
    .innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId)).where(eq(bookings.id, bookingId));
  const deny = async (code: "NOT_FOUND" | "FORBIDDEN" | "NOT_ELIGIBLE" | "OUTSIDE_JOIN_WINDOW" | "CLASSROOM_PROVIDER_NOT_CONFIGURED", msg: string) => {
    if (row) await db.insert(classroomEvents).values({ bookingId: row.b.id, userId: actor.id, kind: "token_denied", detail: code });
    throw new AppError(code, msg);
  };
  if (!row) throw new AppError("NOT_FOUND", "Lesson not found.");
  const { b, teacherUserId } = row;
  const isTeacher = actor.id === teacherUserId;
  if (actor.id !== b.studentId && !isTeacher) return deny("NOT_FOUND", "Lesson not found.");
  if (!["confirmed", "in_progress"].includes(b.status)) return deny("NOT_ELIGIBLE", `This lesson is ${b.status.replace(/_/g, " ")} and cannot be joined.`);
  if (b.mode !== "online") return deny("NOT_ELIGIBLE", "This is an in-person lesson.");
  const { opensAt, closesAt } = joinWindow(b);
  if (now < opensAt || now > closesAt) return deny("OUTSIDE_JOIN_WINDOW", `The classroom opens at ${opensAt.toISOString()} and closes at ${closesAt.toISOString()}.`);
  if (!provider) return deny("CLASSROOM_PROVIDER_NOT_CONFIGURED", "Live video is not configured on this deployment (LiveKit credentials missing).");
  const [p] = await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, actor.id));
  const ttl = Math.max(60, Math.min(TOKEN_TTL_SECONDS, Math.floor((closesAt.getTime() - now.getTime()) / 1000)));
  // Group seats share the session's room; 1:1 lessons use the booking's own random room name.
  let room = b.roomName;
  if (b.groupSessionId) {
    const [g] = await db.select({ roomName: groupSessions.roomName }).from(groupSessions).where(eq(groupSessions.id, b.groupSessionId));
    if (g) room = g.roomName;
  }
  const token = await provider.issueToken({ room, identity: actor.id, name: p?.name ?? "Participant", ttlSeconds: ttl, isTeacher });
  await db.transaction(async (tx) => {
    await tx.insert(classroomEvents).values({ bookingId: b.id, userId: actor.id, kind: "token_issued", detail: isTeacher ? "teacher" : "student" });
    if (isTeacher && b.status === "confirmed" && now >= opensAt) {
      const [cur] = await tx.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.id, b.id)).for("update");
      if (cur.status === "confirmed") await transition(tx, cur, "in_progress", "system", actor.id, { reason: "teacher_joined_classroom" });
    }
  });
  return { token, url: provider.url, room, expiresInSeconds: ttl, role: isTeacher ? "teacher" : "student" };
}

export async function recordClassroomEvent(db: DB, actor: Principal, bookingId: string, kind: "joined" | "left") {
  const [row] = await db.select({ b: bookings, teacherUserId: teacherProfiles.userId }).from(bookings)
    .innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId)).where(eq(bookings.id, bookingId));
  if (!row || (row.b.studentId !== actor.id && row.teacherUserId !== actor.id)) throw new AppError("NOT_FOUND", "Lesson not found.");
  await db.insert(classroomEvents).values({ bookingId, userId: actor.id, kind });
}
