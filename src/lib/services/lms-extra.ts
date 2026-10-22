/**
 * LMS additions: assignments with written answers + manual grading (append-only grading history),
 * per-lesson private notes, bookmarks, and course announcements (notified to enrolled learners).
 * Access rules reuse the course rules: owners manage, ACTIVE enrollees participate.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DbOrTx } from "../db";
import {
  assignmentSubmissions, assignments, courseAnnouncements, courseBookmarks, courseEnrollments, courseLessons, courseNotes, courses,
  profiles, submissionGrades, teacherProfiles,
} from "../db/schema";
import { AppError } from "../errors";
import type { Principal } from "../auth/permissions";
import { lessonAccess } from "./courses";
import { notify } from "./notify";
import { rateLimit } from "./rate-limit";

async function courseRole(db: DbOrTx, actor: Principal, courseId: string) {
  const [row] = await db.select({ c: courses, teacherUserId: teacherProfiles.userId }).from(courses).innerJoin(teacherProfiles, eq(teacherProfiles.id, courses.teacherId)).where(eq(courses.id, courseId));
  if (!row) throw new AppError("NOT_FOUND", "Course not found.");
  const isOwner = row.teacherUserId === actor.id;
  const [e] = isOwner ? [] : await db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, actor.id), eq(courseEnrollments.status, "active")));
  if (!isOwner && (!e || row.c.status !== "published")) throw new AppError("NOT_FOUND", "Course not found.");
  return { course: row.c, isOwner, enrolled: !!e };
}

// ------------------------------------------------------------------ assignments
export const assignmentSchema = z.object({
  title: z.string().trim().min(3).max(160), instructions: z.string().trim().min(10).max(10000),
  maxPoints: z.coerce.number().int().min(1).max(1000).default(10), dueAt: z.coerce.date().optional().nullable(), lessonId: z.string().uuid().optional().nullable(),
});
export const submissionSchema = z.object({ body: z.string().trim().min(1).max(20000) });
export const gradeSchema = z.object({ points: z.coerce.number().int().min(0).max(1000), feedback: z.string().trim().max(4000).default("") });

export async function createAssignment(db: DB, actor: Principal, courseId: string, input: z.infer<typeof assignmentSchema>) {
  const r = await courseRole(db, actor, courseId);
  if (!r.isOwner) throw new AppError("FORBIDDEN", "Only the course teacher can add assignments.");
  if (input.lessonId) {
    const [l] = await db.select({ id: courseLessons.id }).from(courseLessons).where(and(eq(courseLessons.id, input.lessonId), eq(courseLessons.courseId, courseId)));
    if (!l) throw new AppError("VALIDATION_FAILED", "Lesson is not part of this course.");
  }
  const [a] = await db.insert(assignments).values({ courseId, title: input.title, instructions: input.instructions, maxPoints: input.maxPoints, dueAt: input.dueAt ?? null, lessonId: input.lessonId ?? null }).returning();
  return a;
}

export async function listAssignments(db: DbOrTx, actor: Principal, courseId: string) {
  const r = await courseRole(db, actor, courseId);
  const list = await db.select().from(assignments).where(eq(assignments.courseId, courseId)).orderBy(asc(assignments.createdAt));
  if (r.isOwner) {
    const subs = await db.select({ s: assignmentSubmissions, name: profiles.displayName }).from(assignmentSubmissions)
      .innerJoin(assignments, eq(assignments.id, assignmentSubmissions.assignmentId)).innerJoin(profiles, eq(profiles.userId, assignmentSubmissions.userId))
      .where(eq(assignments.courseId, courseId)).orderBy(asc(assignmentSubmissions.submittedAt));
    return { isOwner: true, course: r.course, assignments: list.map((a) => ({ ...a, submissions: subs.filter((x) => x.s.assignmentId === a.id).map((x) => ({ ...x.s, learnerName: x.name })), mine: null })) };
  }
  const mine = await db.select().from(assignmentSubmissions).innerJoin(assignments, eq(assignments.id, assignmentSubmissions.assignmentId))
    .where(and(eq(assignments.courseId, courseId), eq(assignmentSubmissions.userId, actor.id)));
  const grades = mine.length ? await db.select().from(submissionGrades).where(inArray(submissionGrades.submissionId, mine.map((m) => m.assignment_submissions.id))).orderBy(desc(submissionGrades.createdAt)) : [];
  return { isOwner: false, course: r.course, assignments: list.map((a) => {
    const m = mine.find((x) => x.assignments.id === a.id)?.assignment_submissions ?? null;
    return { ...a, submissions: [] as Array<typeof assignmentSubmissions.$inferSelect & { learnerName: string }>, mine: m ? { ...m, latestFeedback: grades.find((g) => g.submissionId === m.id)?.feedback ?? null } : null };
  }) };
}

export async function submitAssignment(db: DB, actor: Principal, assignmentId: string, input: z.infer<typeof submissionSchema>, now = new Date()) {
  const [a] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
  if (!a) throw new AppError("NOT_FOUND", "Assignment not found.");
  const r = await courseRole(db, actor, a.courseId);
  if (!r.enrolled) throw new AppError("NOT_ELIGIBLE", "Only enrolled learners can submit.");
  if (a.dueAt && a.dueAt < now) throw new AppError("NOT_ELIGIBLE", "The due date has passed.");
  const [existing] = await db.select().from(assignmentSubmissions).where(and(eq(assignmentSubmissions.assignmentId, a.id), eq(assignmentSubmissions.userId, actor.id)));
  if (existing?.status === "graded") throw new AppError("NOT_ELIGIBLE", "This answer has already been graded.");
  const [s] = existing
    ? await db.update(assignmentSubmissions).set({ body: input.body, submittedAt: now, updatedAt: now }).where(eq(assignmentSubmissions.id, existing.id)).returning()
    : await db.insert(assignmentSubmissions).values({ assignmentId: a.id, userId: actor.id, body: input.body }).returning();
  return s;
}

export async function gradeSubmission(db: DB, actor: Principal, submissionId: string, input: z.infer<typeof gradeSchema>) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ s: assignmentSubmissions, a: assignments }).from(assignmentSubmissions).innerJoin(assignments, eq(assignments.id, assignmentSubmissions.assignmentId))
      .where(eq(assignmentSubmissions.id, submissionId)).for("update", { of: assignmentSubmissions });
    if (!row) throw new AppError("NOT_FOUND", "Submission not found.");
    const r = await courseRole(tx, actor, row.a.courseId).catch(() => null);
    if (!r?.isOwner) throw new AppError("NOT_FOUND", "Submission not found.");
    if (input.points > row.a.maxPoints) throw new AppError("VALIDATION_FAILED", `Maximum is ${row.a.maxPoints} points.`);
    await tx.insert(submissionGrades).values({ submissionId, graderId: actor.id, points: input.points, feedback: input.feedback });
    await tx.update(assignmentSubmissions).set({ status: "graded", points: input.points, updatedAt: new Date() }).where(eq(assignmentSubmissions.id, submissionId));
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(submissionGrades).where(eq(submissionGrades.submissionId, submissionId));
    await notify(tx, { userId: row.s.userId, kind: "assignment_graded", title: `Graded: ${row.a.title}`, body: `${input.points}/${row.a.maxPoints}`, link: `/my-courses/${row.a.courseId}/assignments`, dedupeKey: `assignment_graded:${submissionId}:${n}` });
    return { points: input.points, version: n };
  });
}

export async function gradingHistory(db: DbOrTx, actor: Principal, submissionId: string) {
  const [row] = await db.select({ s: assignmentSubmissions, a: assignments }).from(assignmentSubmissions).innerJoin(assignments, eq(assignments.id, assignmentSubmissions.assignmentId)).where(eq(assignmentSubmissions.id, submissionId));
  if (!row) throw new AppError("NOT_FOUND", "Submission not found.");
  if (row.s.userId !== actor.id) {
    const r = await courseRole(db, actor, row.a.courseId).catch(() => null);
    if (!r?.isOwner) throw new AppError("NOT_FOUND", "Submission not found.");
  }
  const rows = await db.select({ g: submissionGrades, grader: profiles.displayName }).from(submissionGrades).innerJoin(profiles, eq(profiles.userId, submissionGrades.graderId))
    .where(eq(submissionGrades.submissionId, submissionId)).orderBy(asc(submissionGrades.createdAt));
  return rows.map((x) => ({ ...x.g, grader: x.grader }));
}

// ------------------------------------------------------------------ notes & bookmarks (private to the learner)
export const noteSchema = z.object({ body: z.string().trim().min(1).max(10000) });

export async function saveNote(db: DB, actor: Principal, lessonId: string, input: z.infer<typeof noteSchema>) {
  const a = await lessonAccess(db, actor, lessonId);
  if (!a.enrolled && !a.isOwner) throw new AppError("NOT_ELIGIBLE", "Enroll to take notes.");
  const [n] = await db.insert(courseNotes).values({ userId: actor.id, lessonId, courseId: a.c.id, body: input.body })
    .onConflictDoUpdate({ target: [courseNotes.userId, courseNotes.lessonId], set: { body: input.body, updatedAt: new Date() } }).returning();
  return n;
}

export async function getNote(db: DbOrTx, actor: Principal, lessonId: string) {
  const [n] = await db.select().from(courseNotes).where(and(eq(courseNotes.userId, actor.id), eq(courseNotes.lessonId, lessonId)));
  return n ?? null;
}

export async function setBookmark(db: DB, actor: Principal, lessonId: string, on: boolean) {
  const a = await lessonAccess(db, actor, lessonId);
  if (!a.enrolled && !a.isOwner) throw new AppError("NOT_ELIGIBLE", "Enroll to bookmark lessons.");
  if (on) await db.insert(courseBookmarks).values({ userId: actor.id, lessonId, courseId: a.c.id }).onConflictDoNothing();
  else await db.delete(courseBookmarks).where(and(eq(courseBookmarks.userId, actor.id), eq(courseBookmarks.lessonId, lessonId)));
  return { bookmarked: on };
}

export async function listBookmarks(db: DbOrTx, actor: Principal) {
  return db.select({ lessonId: courseBookmarks.lessonId, lessonTitle: courseLessons.title, courseTitle: courses.title, courseSlug: courses.slug, createdAt: courseBookmarks.createdAt })
    .from(courseBookmarks).innerJoin(courseLessons, eq(courseLessons.id, courseBookmarks.lessonId)).innerJoin(courses, eq(courses.id, courseBookmarks.courseId))
    .where(eq(courseBookmarks.userId, actor.id)).orderBy(desc(courseBookmarks.createdAt));
}

export async function isBookmarked(db: DbOrTx, actor: Principal, lessonId: string) {
  const [b] = await db.select({ l: courseBookmarks.lessonId }).from(courseBookmarks).where(and(eq(courseBookmarks.userId, actor.id), eq(courseBookmarks.lessonId, lessonId)));
  return !!b;
}

// ------------------------------------------------------------------ announcements
export const announcementSchema = z.object({ title: z.string().trim().min(3).max(160), body: z.string().trim().min(5).max(5000) });

export async function postAnnouncement(db: DB, actor: Principal, courseId: string, input: z.infer<typeof announcementSchema>) {
  const r = await courseRole(db, actor, courseId);
  if (!r.isOwner) throw new AppError("FORBIDDEN", "Only the course teacher can post announcements.");
  const rl = await rateLimit(db, `announce:${actor.id}`, 10, 86400);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Announcement limit reached for today.");
  return db.transaction(async (tx) => {
    const [a] = await tx.insert(courseAnnouncements).values({ courseId, authorId: actor.id, title: input.title, body: input.body }).returning();
    const learners = await tx.select({ userId: courseEnrollments.userId }).from(courseEnrollments).where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.status, "active")));
    for (const l of learners) await notify(tx, { userId: l.userId, kind: "course_announcement", title: `${r.course.title}: ${input.title}`, body: input.body.slice(0, 200), link: `/my-courses/${courseId}/assignments`, dedupeKey: `announcement:${a.id}` });
    return { ...a, notified: learners.length };
  });
}

export async function listAnnouncements(db: DbOrTx, actor: Principal, courseId: string) {
  await courseRole(db, actor, courseId);
  return db.select().from(courseAnnouncements).where(eq(courseAnnouncements.courseId, courseId)).orderBy(desc(courseAnnouncements.createdAt)).limit(50);
}
