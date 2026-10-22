/**
 * Courses / LMS. Paid lesson content is protected server-side: lesson bodies are only returned to
 * enrolled learners, the owning teacher, or for lessons explicitly marked as previews.
 * Enrollment for paid courses is granted only by a verified payment webhook (see payments/webhooks.ts).
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DbOrTx } from "../db";
import {
  certificates, courseEnrollments, courseLessons, courseSections, courses, lessonProgress, orderItems, orders, paymentIntents,
  profiles, questionOptions, quizAttempts, quizQuestions, quizzes, teacherProfiles, users,
} from "../db/schema";
import { AppError, pgCode, PG_UNIQUE_VIOLATION } from "../errors";
import type { Principal } from "../auth/permissions";
import { gradeQuiz, isCourseComplete, progressPct, seededShuffle } from "../lms/grading";
import { randomToken } from "../crypto";
import { requireTeacher } from "./teachers";
import type { PaymentProvider } from "../payments/provider";
import { env } from "../env";
import { notify } from "./notify";
import { SUPPORTED_CURRENCIES } from "../money";

type Course = typeof courses.$inferSelect;

export async function listPublishedCourses(db: DbOrTx, f: { q?: string; subject?: string; level?: string; language?: string; free?: boolean } = {}) {
  const where = [sql`c.status = 'published'`];
  if (f.q) where.push(sql`(to_tsvector('simple', coalesce(c.title,'') || ' ' || coalesce(c.summary,'')) @@ websearch_to_tsquery('simple', ${f.q}) OR c.title ILIKE ${"%" + f.q.replace(/[%_\\]/g, "") + "%"})`);
  if (f.subject) where.push(sql`s.slug = ${f.subject}`);
  if (f.level) where.push(sql`c.level = ${f.level}`);
  if (f.language) where.push(sql`c.language = ${f.language}`);
  if (f.free) where.push(sql`c.price_minor = 0`);
  const r = await db.execute<{ id: string; slug: string; title: string; summary: string; level: string; language: string; price_minor: number; currency: string; is_demo: boolean; teacher: string; lessons: number; minutes: number; subject: string | null }>(sql`
    SELECT c.id, c.slug, c.title, c.summary, c.level, c.language, c.price_minor, c.currency, c.is_demo, p.display_name AS teacher, s.name_en AS subject,
      (SELECT count(*)::int FROM course_lessons l WHERE l.course_id = c.id) AS lessons,
      (SELECT coalesce(sum(l.duration_minutes),0)::int FROM course_lessons l WHERE l.course_id = c.id) AS minutes
    FROM courses c JOIN teacher_profiles tp ON tp.id = c.teacher_id JOIN profiles p ON p.user_id = tp.user_id LEFT JOIN subjects s ON s.id = c.subject_id
    WHERE ${sql.join(where, sql` AND `)} ORDER BY c.published_at DESC NULLS LAST LIMIT 50`);
  return r.rows;
}

async function curriculum(db: DbOrTx, courseId: string) {
  const sections = await db.select().from(courseSections).where(eq(courseSections.courseId, courseId)).orderBy(asc(courseSections.position));
  const lessons = await db.select({ id: courseLessons.id, sectionId: courseLessons.sectionId, title: courseLessons.title, type: courseLessons.type, isPreview: courseLessons.isPreview, durationMinutes: courseLessons.durationMinutes, position: courseLessons.position })
    .from(courseLessons).where(eq(courseLessons.courseId, courseId)).orderBy(asc(courseLessons.position));
  return sections.map((s) => ({ ...s, lessons: lessons.filter((l) => l.sectionId === s.id) }));
}

export async function getCourseForViewer(db: DbOrTx, slug: string, viewer: Principal | null) {
  const [row] = await db.select({ c: courses, teacherName: profiles.displayName, teacherSlug: teacherProfiles.slug, teacherUserId: teacherProfiles.userId })
    .from(courses).innerJoin(teacherProfiles, eq(teacherProfiles.id, courses.teacherId)).innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId)).where(eq(courses.slug, slug));
  if (!row) return null;
  const isOwner = viewer?.id === row.teacherUserId;
  if (row.c.status !== "published" && !isOwner) return null;
  const sections = await curriculum(db, row.c.id);
  const enrollment = viewer ? (await db.select().from(courseEnrollments).where(and(eq(courseEnrollments.courseId, row.c.id), eq(courseEnrollments.userId, viewer.id))))[0] ?? null : null;
  const progress = viewer && enrollment ? await courseProgress(db, viewer.id, row.c.id) : null;
  const [cert] = viewer ? await db.select().from(certificates).where(and(eq(certificates.courseId, row.c.id), eq(certificates.userId, viewer.id))) : [];
  return { course: row.c, teacherName: row.teacherName, teacherSlug: row.teacherSlug, isOwner, sections, enrollment, progress, certificate: cert ?? null };
}

async function courseProgress(db: DbOrTx, userId: string, courseId: string) {
  const lessons = await db.select({ id: courseLessons.id, type: courseLessons.type }).from(courseLessons).where(eq(courseLessons.courseId, courseId));
  const done = new Set((await db.select({ id: lessonProgress.lessonId }).from(lessonProgress).where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.courseId, courseId)))).map((r) => r.id));
  const passed = new Set((await db.select({ lessonId: quizzes.lessonId }).from(quizAttempts).innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.passed, true), inArray(quizzes.lessonId, lessons.map((l) => l.id).concat(["00000000-0000-0000-0000-000000000000"]))))).map((r) => r.lessonId));
  return { lessons, done, passed, pct: progressPct(lessons, done, passed), complete: isCourseComplete(lessons, done, passed) };
}

export async function enrollFree(db: DB, actor: Principal, courseId: string) {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!c || c.status !== "published") throw new AppError("NOT_FOUND", "Course not found");
  if (c.priceMinor !== 0) throw new AppError("NOT_ELIGIBLE", "This course requires payment.");
  await db.insert(courseEnrollments).values({ courseId, userId: actor.id, source: "free" }).onConflictDoNothing();
  return { ok: true };
}

export async function startCourseCheckout(db: DB, actor: Principal, courseId: string, provider: PaymentProvider | null) {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!c || c.status !== "published") throw new AppError("NOT_FOUND", "Course not found");
  if (c.priceMinor === 0) throw new AppError("NOT_ELIGIBLE", "This course is free; enroll directly.");
  const [already] = await db.select().from(courseEnrollments).where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, actor.id)));
  if (already) throw new AppError("CONFLICT", "You are already enrolled.");
  if (!provider) throw new AppError("PAYMENT_PROVIDER_NOT_CONFIGURED", "Online payment is not configured on this deployment yet. No charge was made.");
  const prep = await db.transaction(async (tx) => {
    const [o] = await tx.insert(orders).values({ buyerId: actor.id, totalMinor: c.priceMinor, currency: c.currency, provider: provider.name }).returning();
    await tx.insert(orderItems).values({ orderId: o.id, kind: "course", courseId: c.id, description: c.title, amountMinor: c.priceMinor, currency: c.currency });
    const [pi] = await tx.insert(paymentIntents).values({ orderId: o.id, provider: provider.name, amountMinor: c.priceMinor, currency: c.currency }).returning();
    const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, actor.id));
    return { o, pi, email: u.email };
  });
  try {
    const s = await provider.createCheckout({ orderId: prep.o.id, paymentIntentId: prep.pi.id, amountMinor: c.priceMinor, currency: c.currency, description: c.title, customerEmail: prep.email,
      successUrl: `${env().APP_URL}/courses/${c.slug}?checkout=success`, cancelUrl: `${env().APP_URL}/courses/${c.slug}?checkout=canceled` });
    await db.update(paymentIntents).set({ providerRef: s.providerRef, status: "requires_action" }).where(eq(paymentIntents.id, prep.pi.id));
    return { url: s.url };
  } catch (e) {
    await db.update(paymentIntents).set({ status: "failed" }).where(eq(paymentIntents.id, prep.pi.id));
    throw new AppError("PROVIDER_ERROR", `The payment provider rejected the checkout: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function lessonAccess(db: DbOrTx, actor: Principal | null, lessonId: string) {
  const [row] = await db.select({ l: courseLessons, c: courses, teacherUserId: teacherProfiles.userId }).from(courseLessons)
    .innerJoin(courses, eq(courses.id, courseLessons.courseId)).innerJoin(teacherProfiles, eq(teacherProfiles.id, courses.teacherId)).where(eq(courseLessons.id, lessonId));
  if (!row) throw new AppError("NOT_FOUND", "Lesson not found");
  const isOwner = actor?.id === row.teacherUserId;
  if (row.c.status !== "published" && !isOwner) throw new AppError("NOT_FOUND", "Lesson not found");
  const enrolled = actor ? (await db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(and(eq(courseEnrollments.courseId, row.c.id), eq(courseEnrollments.userId, actor.id), eq(courseEnrollments.status, "active")))).length > 0 : false;
  if (!isOwner && !enrolled && !row.l.isPreview) throw new AppError("FORBIDDEN", "Enroll in this course to access this lesson.");
  return { ...row, isOwner, enrolled };
}

/** Lesson content + (for quizzes) questions WITHOUT correct answers. */
export async function getLessonForUser(db: DbOrTx, actor: Principal | null, lessonId: string) {
  const a = await lessonAccess(db, actor, lessonId);
  let quiz: null | { id: string; maxAttempts: number; passingScorePct: number; attemptsUsed: number; bestScore: number | null; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }> } = null;
  if (a.l.type === "quiz") {
    const [q] = await db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId));
    if (q) {
      const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, q.id)).orderBy(asc(quizQuestions.position));
      const opts = qs.length ? await db.select({ id: questionOptions.id, questionId: questionOptions.questionId, label: questionOptions.label, position: questionOptions.position }).from(questionOptions).where(inArray(questionOptions.questionId, qs.map((x) => x.id))).orderBy(asc(questionOptions.position)) : [];
      const attempts = actor ? await db.select().from(quizAttempts).where(and(eq(quizAttempts.quizId, q.id), eq(quizAttempts.userId, actor.id))) : [];
      const ordered = q.shuffle && actor ? seededShuffle(qs, `${actor.id}:${q.id}:${attempts.length}`) : qs;
      quiz = { id: q.id, maxAttempts: q.maxAttempts, passingScorePct: q.passingScorePct, attemptsUsed: attempts.length, bestScore: attempts.length ? Math.max(...attempts.map((x) => x.scorePct)) : null,
        questions: ordered.map((x) => ({ id: x.id, prompt: x.prompt, options: opts.filter((o) => o.questionId === x.id).map((o) => ({ id: o.id, label: o.label })) })) };
    }
  }
  if (actor && a.enrolled) await db.update(courseEnrollments).set({ lastLessonId: lessonId }).where(and(eq(courseEnrollments.courseId, a.c.id), eq(courseEnrollments.userId, actor.id)));
  return { lesson: a.l, course: a.c, quiz, isOwner: a.isOwner, enrolled: a.enrolled };
}

export async function markLessonComplete(db: DB, actor: Principal, lessonId: string) {
  const a = await lessonAccess(db, actor, lessonId);
  if (!a.enrolled) throw new AppError("NOT_ELIGIBLE", "Only enrolled learners record progress.");
  if (a.l.type === "quiz") throw new AppError("NOT_ELIGIBLE", "Quizzes are completed by passing them.");
  await db.insert(lessonProgress).values({ userId: actor.id, lessonId, courseId: a.c.id }).onConflictDoNothing();
  return maybeIssueCertificate(db, actor, a.c);
}

export const quizSubmitSchema = z.object({ answers: z.record(z.string().uuid(), z.array(z.string().uuid()).max(10)) });

export async function submitQuiz(db: DB, actor: Principal, quizId: string, answers: Record<string, string[]>) {
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, quizId));
  if (!q) throw new AppError("NOT_FOUND", "Quiz not found");
  const a = await lessonAccess(db, actor, q.lessonId);
  if (!a.enrolled) throw new AppError("NOT_ELIGIBLE", "Enroll to take this quiz.");
  const result = await db.transaction(async (tx) => {
    // serialise attempts per user+quiz so the attempt limit cannot be raced
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`quiz:${quizId}:${actor.id}`}))`);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(quizAttempts).where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, actor.id)));
    if (n >= q.maxAttempts) throw new AppError("NOT_ELIGIBLE", "No attempts left for this quiz.");
    const qs = await tx.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId));
    const opts = await tx.select().from(questionOptions).where(inArray(questionOptions.questionId, qs.map((x) => x.id).concat(["00000000-0000-0000-0000-000000000000"])));
    const graded = gradeQuiz(qs.map((x) => ({ id: x.id, points: x.points, correctOptionIds: opts.filter((o) => o.questionId === x.id && o.isCorrect).map((o) => o.id) })), answers, q.passingScorePct);
    await tx.insert(quizAttempts).values({ quizId, userId: actor.id, scorePct: graded.scorePct, passed: graded.passed, answers });
    return { ...graded, attemptsUsed: n + 1, maxAttempts: q.maxAttempts, explanations: Object.fromEntries(qs.map((x) => [x.id, x.explanation ?? ""])) };
  });
  const cert = await maybeIssueCertificate(db, actor, a.c);
  return { ...result, certificate: cert.certificate };
}

/** Certificates are issued only when the course's completion rule is satisfied (checked server-side). */
async function maybeIssueCertificate(db: DB, actor: Principal, c: Course) {
  const p = await courseProgress(db, actor.id, c.id);
  if (!p.complete) return { complete: false, certificate: null, pct: p.pct };
  const [existing] = await db.select().from(certificates).where(and(eq(certificates.courseId, c.id), eq(certificates.userId, actor.id)));
  if (existing) return { complete: true, certificate: existing, pct: 100 };
  const [pr] = await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, actor.id));
  try {
    const [cert] = await db.insert(certificates).values({ code: `CB-${randomToken(9).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`, courseId: c.id, userId: actor.id, recipientName: pr.name, courseTitle: c.title }).returning();
    await db.update(courseEnrollments).set({ completedAt: new Date() }).where(and(eq(courseEnrollments.courseId, c.id), eq(courseEnrollments.userId, actor.id)));
    await notify(db, { userId: actor.id, kind: "certificate", title: "Certificate issued", body: c.title, link: `/certificates/${cert.code}`, dedupeKey: `certificate:${cert.id}` });
    return { complete: true, certificate: cert, pct: 100 };
  } catch (e) {
    if (pgCode(e) === PG_UNIQUE_VIOLATION) {
      const [again] = await db.select().from(certificates).where(and(eq(certificates.courseId, c.id), eq(certificates.userId, actor.id)));
      return { complete: true, certificate: again, pct: 100 };
    }
    throw e;
  }
}

export async function myCourses(db: DbOrTx, userId: string) {
  const rows = await db.select({ c: courses, e: courseEnrollments }).from(courseEnrollments).innerJoin(courses, eq(courses.id, courseEnrollments.courseId)).where(eq(courseEnrollments.userId, userId)).orderBy(desc(courseEnrollments.createdAt));
  return Promise.all(rows.map(async (r) => ({ ...r, progress: (await courseProgress(db, userId, r.c.id)).pct })));
}

export async function verifyCertificate(db: DbOrTx, code: string) {
  if (!/^CB-[A-Z0-9]{6,20}$/.test(code)) return null;
  const [c] = await db.select().from(certificates).where(eq(certificates.code, code));
  return c ?? null;
}

// ------------------------------------------------------------------ teacher course builder
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const courseSchema = z.object({
  title: z.string().trim().min(3).max(140), summary: z.string().trim().max(2000).default(""), objectives: z.string().trim().max(2000).default(""),
  prerequisites: z.string().trim().max(1000).default(""), level: z.enum(LEVELS), language: z.enum(["en", "fr", "ar", "de", "es", "it"]),
  priceMinor: z.coerce.number().int().min(0).max(10_000_000), currency: z.enum(SUPPORTED_CURRENCIES), subjectId: z.string().uuid().nullable().optional(),
  passingScorePct: z.coerce.number().int().min(1).max(100).default(70),
});

async function ownCourse(db: DbOrTx, actor: Principal, courseId: string) {
  const t = await requireTeacher(db, actor.id);
  const [c] = await db.select().from(courses).where(and(eq(courses.id, courseId), eq(courses.teacherId, t.id)));
  if (!c) throw new AppError("NOT_FOUND", "Course not found");
  return c;
}

export async function createCourse(db: DB, actor: Principal, input: z.infer<typeof courseSchema>) {
  const t = await requireTeacher(db, actor.id);
  const slug = `${input.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "course"}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
  const [c] = await db.insert(courses).values({ ...input, subjectId: input.subjectId ?? null, teacherId: t.id, slug }).returning();
  return c;
}
export async function updateCourse(db: DB, actor: Principal, courseId: string, input: z.infer<typeof courseSchema>) {
  await ownCourse(db, actor, courseId);
  await db.update(courses).set({ ...input, subjectId: input.subjectId ?? null, updatedAt: new Date() }).where(eq(courses.id, courseId));
}
export async function setCourseStatus(db: DB, actor: Principal, courseId: string, status: "draft" | "published" | "archived") {
  const c = await ownCourse(db, actor, courseId);
  if (status === "published") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(courseLessons).where(eq(courseLessons.courseId, courseId));
    if (n === 0) throw new AppError("VALIDATION_FAILED", "Add at least one lesson before publishing.");
    const [tp] = await db.select({ s: teacherProfiles.publishState }).from(teacherProfiles).where(eq(teacherProfiles.id, c.teacherId));
    if (tp.s !== "published") throw new AppError("NOT_ELIGIBLE", "Your teacher profile must be approved before publishing courses.");
  }
  await db.update(courses).set({ status, publishedAt: status === "published" ? c.publishedAt ?? new Date() : c.publishedAt, updatedAt: new Date() }).where(eq(courses.id, courseId));
}
export async function addSection(db: DB, actor: Principal, courseId: string, title: string) {
  await ownCourse(db, actor, courseId);
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(position),0)::int` }).from(courseSections).where(eq(courseSections.courseId, courseId));
  const [s] = await db.insert(courseSections).values({ courseId, title, position: m + 1 }).returning();
  return s;
}
export const lessonSchema = z.object({
  sectionId: z.string().uuid(), title: z.string().trim().min(2).max(160), type: z.enum(["text", "video", "resource", "link", "quiz"]),
  content: z.string().max(20000).default(""), externalUrl: z.string().url().regex(/^https:\/\//).max(500).optional().or(z.literal("")),
  isPreview: z.boolean().default(false), durationMinutes: z.coerce.number().int().min(1).max(600).default(5),
});
export async function addLesson(db: DB, actor: Principal, courseId: string, input: z.infer<typeof lessonSchema>) {
  await ownCourse(db, actor, courseId);
  const [sec] = await db.select().from(courseSections).where(and(eq(courseSections.id, input.sectionId), eq(courseSections.courseId, courseId)));
  if (!sec) throw new AppError("NOT_FOUND", "Section not found");
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(position),0)::int` }).from(courseLessons).where(eq(courseLessons.courseId, courseId));
  const [l] = await db.insert(courseLessons).values({ ...input, externalUrl: input.externalUrl || null, courseId, position: m + 1 }).returning();
  if (input.type === "quiz") await db.insert(quizzes).values({ lessonId: l.id });
  return l;
}
/** Curriculum reorder: swap a lesson with its neighbour (positions are course-wide). */
export async function moveLesson(db: DB, actor: Principal, courseId: string, lessonId: string, dir: "up" | "down") {
  await ownCourse(db, actor, courseId);
  await db.transaction(async (tx) => {
    const list = await tx.select().from(courseLessons).where(eq(courseLessons.courseId, courseId)).orderBy(asc(courseLessons.position)).for("update");
    const i = list.findIndex((l) => l.id === lessonId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    await tx.update(courseLessons).set({ position: list[j].position }).where(eq(courseLessons.id, list[i].id));
    await tx.update(courseLessons).set({ position: list[i].position }).where(eq(courseLessons.id, list[j].id));
  });
}
export const questionSchema = z.object({
  prompt: z.string().trim().min(3).max(1000), explanation: z.string().max(1000).optional(),
  options: z.array(z.object({ label: z.string().trim().min(1).max(300), isCorrect: z.boolean() })).min(2).max(6).refine((o) => o.some((x) => x.isCorrect), "one_correct_required"),
});
export async function addQuestion(db: DB, actor: Principal, courseId: string, quizId: string, input: z.infer<typeof questionSchema>) {
  await ownCourse(db, actor, courseId);
  const [q] = await db.select({ q: quizzes }).from(quizzes).innerJoin(courseLessons, eq(courseLessons.id, quizzes.lessonId)).where(and(eq(quizzes.id, quizId), eq(courseLessons.courseId, courseId)));
  if (!q) throw new AppError("NOT_FOUND", "Quiz not found");
  await db.transaction(async (tx) => {
    const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(position),0)::int` }).from(quizQuestions).where(eq(quizQuestions.quizId, quizId));
    const kind = input.options.filter((o) => o.isCorrect).length > 1 ? "multiple_choice" : "single_choice";
    const [qq] = await tx.insert(quizQuestions).values({ quizId, prompt: input.prompt, explanation: input.explanation ?? null, kind, position: m + 1 }).returning();
    await tx.insert(questionOptions).values(input.options.map((o, i) => ({ questionId: qq.id, label: o.label, isCorrect: o.isCorrect, position: i + 1 })));
  });
}

export async function teacherCourses(db: DbOrTx, actor: Principal) {
  const t = await requireTeacher(db, actor.id);
  return db.select({ c: courses, learners: sql<number>`(SELECT count(*)::int FROM course_enrollments e WHERE e.course_id = ${courses.id})` }).from(courses).where(eq(courses.teacherId, t.id)).orderBy(desc(courses.createdAt));
}

export async function courseBuilderData(db: DbOrTx, actor: Principal, courseId: string) {
  const c = await ownCourse(db, actor, courseId);
  const sections = await curriculum(db, courseId);
  const qz = await db.select({ id: quizzes.id, lessonId: quizzes.lessonId, questions: sql<number>`(SELECT count(*)::int FROM quiz_questions q WHERE q.quiz_id = ${quizzes.id})` })
    .from(quizzes).innerJoin(courseLessons, eq(courseLessons.id, quizzes.lessonId)).where(eq(courseLessons.courseId, courseId));
  const learners = await db.select({ name: profiles.displayName, enrolledAt: courseEnrollments.createdAt, completedAt: courseEnrollments.completedAt }).from(courseEnrollments)
    .innerJoin(profiles, eq(profiles.userId, courseEnrollments.userId)).where(eq(courseEnrollments.courseId, courseId));
  return { course: c, sections, quizzes: qz, learners };
}
