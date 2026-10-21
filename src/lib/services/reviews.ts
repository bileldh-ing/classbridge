/** Reviews: only the student of a completed (attended) booking, once per booking, editable for 14 days. */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db";
import { bookings, reviews, teacherProfiles, userReports } from "../db/schema";
import { AppError, pgCode, PG_UNIQUE_VIOLATION } from "../errors";
import type { Principal } from "../auth/permissions";
import { notify } from "./notify";

export const REVIEW_EDIT_DAYS = 14;
export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(2000).default(""),
});

export async function reviewEligibility(db: DB, actor: Principal, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.studentId !== actor.id) return { eligible: false as const, reason: "not_your_booking" as const };
  if (b.status !== "completed" || !["present", "late"].includes(b.attendanceStatus ?? "")) return { eligible: false as const, reason: "not_completed" as const };
  const [r] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.bookingId, bookingId));
  if (r) return { eligible: false as const, reason: "already_reviewed" as const };
  return { eligible: true as const, booking: b };
}

export async function createReview(db: DB, actor: Principal, input: z.infer<typeof reviewSchema>) {
  const el = await reviewEligibility(db, actor, input.bookingId);
  if (!el.eligible) {
    if (el.reason === "already_reviewed") throw new AppError("CONFLICT", "You already reviewed this lesson.");
    throw new AppError("NOT_ELIGIBLE", el.reason === "not_your_booking" ? "Only the student of this lesson can review it." : "You can review a lesson once it has been completed.");
  }
  try {
    const [r] = await db.insert(reviews).values({
      bookingId: el.booking.id, studentId: actor.id, teacherId: el.booking.teacherId, rating: input.rating, body: input.body,
      editableUntil: new Date(Date.now() + REVIEW_EDIT_DAYS * 86_400_000),
    }).returning();
    const [t] = await db.select({ userId: teacherProfiles.userId }).from(teacherProfiles).where(eq(teacherProfiles.id, el.booking.teacherId));
    await notify(db, { userId: t.userId, kind: "review_received", title: "New review", body: `You received a ${input.rating}★ review.`, link: "/teach", dedupeKey: `review:${r.id}` });
    return r;
  } catch (e) {
    if (pgCode(e) === PG_UNIQUE_VIOLATION) throw new AppError("CONFLICT", "You already reviewed this lesson.");
    throw e;
  }
}

export async function updateReview(db: DB, actor: Principal, reviewId: string, input: { rating: number; body: string }) {
  const [r] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!r || r.studentId !== actor.id) throw new AppError("NOT_FOUND", "Review not found.");
  if (r.editableUntil < new Date()) throw new AppError("NOT_ELIGIBLE", "The editing window for this review has closed.");
  await db.update(reviews).set({ rating: input.rating, body: input.body, updatedAt: new Date() }).where(eq(reviews.id, reviewId));
}

export async function respondToReview(db: DB, actor: Principal, reviewId: string, response: string) {
  const [row] = await db.select({ r: reviews, teacherUserId: teacherProfiles.userId }).from(reviews).innerJoin(teacherProfiles, eq(teacherProfiles.id, reviews.teacherId)).where(eq(reviews.id, reviewId));
  if (!row || row.teacherUserId !== actor.id) throw new AppError("NOT_FOUND", "Review not found.");
  await db.update(reviews).set({ teacherResponse: response.slice(0, 1000), updatedAt: new Date() }).where(eq(reviews.id, reviewId));
}

export const reportSchema = z.object({
  targetType: z.enum(["teacher_profile", "message", "review", "course", "user"]),
  targetId: z.string().min(1).max(100),
  reason: z.enum(["spam", "harassment", "inappropriate", "fraud", "safety", "other"]),
  details: z.string().trim().max(2000).optional(),
});
export async function createReport(db: DB, actor: Principal | null, input: z.infer<typeof reportSchema>) {
  const [r] = await db.insert(userReports).values({ reporterId: actor?.id ?? null, ...input }).returning({ id: userReports.id });
  // Reports never auto-hide content (that would let anyone suppress reviews); staff moderate from the queue.
  return r;
}
