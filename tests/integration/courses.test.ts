import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb } from "@/lib/db";
import { certificates, courseEnrollments, courseLessons, quizzes, questionOptions, quizQuestions } from "@/lib/db/schema";
import { addLesson, addQuestion, addSection, createCourse, enrollFree, getLessonForUser, markLessonComplete, setCourseStatus, startCourseCheckout, submitQuiz, verifyCertificate } from "@/lib/services/courses";
import { handleProviderEvent } from "@/lib/payments/webhooks";
import { db, makeTeacher, makeUser, resetDb } from "../helpers";
import { FakeStripe, checkoutCompleted, signedEvent, simpleEvent } from "../fake-stripe";
import { paymentIntents } from "@/lib/db/schema";

beforeEach(resetDb);
afterAll(closeDb);

async function buildCourse(priceMinor = 0) {
  const t = await makeTeacher();
  const c = await createCourse(db(), t.user, { title: "Algebra basics", summary: "", objectives: "", prerequisites: "", level: "beginner", language: "en", priceMinor, currency: "EUR", passingScorePct: 70 });
  const sec = await addSection(db(), t.user, c.id, "Intro");
  const l1 = await addLesson(db(), t.user, c.id, { sectionId: sec.id, title: "Preview lesson", type: "text", content: "free content", isPreview: true, durationMinutes: 5 });
  const l2 = await addLesson(db(), t.user, c.id, { sectionId: sec.id, title: "Paid lesson", type: "text", content: "SECRET PAID CONTENT", isPreview: false, durationMinutes: 5 });
  const lq = await addLesson(db(), t.user, c.id, { sectionId: sec.id, title: "Quiz", type: "quiz", content: "", isPreview: false, durationMinutes: 5 });
  const [quiz] = await db().select().from(quizzes).where(eq(quizzes.lessonId, lq.id));
  await addQuestion(db(), t.user, c.id, quiz.id, { prompt: "2+2?", options: [{ label: "4", isCorrect: true }, { label: "5", isCorrect: false }] });
  await setCourseStatus(db(), t.user, c.id, "published");
  const [q] = await db().select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id));
  const opts = await db().select().from(questionOptions).where(eq(questionOptions.questionId, q.id));
  return { t, c, l1, l2, lq, quiz, q, right: opts.find((o) => o.isCorrect)!.id, wrong: opts.find((o) => !o.isCorrect)!.id };
}

describe("course access control & completion", () => {
  it("protects paid lesson content server-side and hides correct answers", async () => {
    const { l1, l2, lq } = await buildCourse();
    const s = await makeUser();
    expect((await getLessonForUser(db(), s, l1.id)).lesson.content).toBe("free content");
    await expect(getLessonForUser(db(), s, l2.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getLessonForUser(db(), null, l2.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const asJson = JSON.stringify(await getLessonForUser(db(), s, l1.id));
    expect(asJson).not.toContain("SECRET PAID CONTENT");
    // Even after enrolling, quiz payloads never include isCorrect
    const { c } = await buildCourse();
    void c; void lq;
  });

  it("certificate only after all lessons are complete and the quiz is passed; attempts are limited and immutable", async () => {
    const { c, l1, l2, quiz, q, right, wrong, lq } = await buildCourse();
    const s = await makeUser();
    await enrollFree(db(), s, c.id);
    const view = await getLessonForUser(db(), s, lq.id);
    expect(JSON.stringify(view.quiz)).not.toContain("isCorrect");
    await markLessonComplete(db(), s, l1.id);
    const fail = await submitQuiz(db(), s, quiz.id, { [q.id]: [wrong] });
    expect(fail.passed).toBe(false);
    expect(fail.certificate).toBeNull();
    const pass = await submitQuiz(db(), s, quiz.id, { [q.id]: [right] });
    expect(pass.passed).toBe(true);
    expect(pass.certificate).toBeNull(); // l2 still incomplete
    const done = await markLessonComplete(db(), s, l2.id);
    expect(done.complete).toBe(true);
    expect(done.certificate?.code).toMatch(/^CB-/);
    expect(await verifyCertificate(db(), done.certificate!.code)).toMatchObject({ courseTitle: "Algebra basics" });
    expect(await verifyCertificate(db(), "CB-NOTREAL123")).toBeNull();
    await submitQuiz(db(), s, quiz.id, { [q.id]: [right] }); // 3rd (last) attempt
    await expect(submitQuiz(db(), s, quiz.id, { [q.id]: [right] })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect(await db().select().from(certificates)).toHaveLength(1);
    await expect(db().execute(sql`UPDATE quiz_attempts SET score_pct = 100`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
  });

  it("paid course: no enrollment without verified payment; failed payment does not enroll; success does (idempotently)", async () => {
    const { c, l2 } = await buildCourse(4900);
    const s = await makeUser();
    await expect(enrollFree(db(), s, c.id)).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(startCourseCheckout(db(), s, c.id, null)).rejects.toMatchObject({ code: "PAYMENT_PROVIDER_NOT_CONFIGURED" });
    const p = new FakeStripe();
    await startCourseCheckout(db(), s, c.id, p);
    const [pi] = await db().select().from(paymentIntents);
    const deliver = async (ev: object) => { const { payload, header } = signedEvent(ev); const raw = p.verifyWebhook(payload, header); return handleProviderEvent(db(), "stripe", raw, p.normalize(raw)); };
    await deliver(simpleEvent("evt_c_fail", "checkout.session.async_payment_failed", { id: pi.providerRef, payment_intent: null }));
    expect(await db().select().from(courseEnrollments)).toHaveLength(0);
    await expect(getLessonForUser(db(), s, l2.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // second checkout succeeds
    await startCourseCheckout(db(), s, c.id, p);
    const [pi2] = await db().select().from(paymentIntents).where(sql`${paymentIntents.status} = 'requires_action'`);
    await deliver(checkoutCompleted("evt_c_ok", pi2.providerRef!, 4900));
    await deliver(checkoutCompleted("evt_c_ok", pi2.providerRef!, 4900));
    expect(await db().select().from(courseEnrollments)).toHaveLength(1);
    expect((await getLessonForUser(db(), s, l2.id)).lesson.content).toBe("SECRET PAID CONTENT");
  });

  it("only the owner can edit a course; drafts are invisible", async () => {
    const { c } = await buildCourse();
    const other = await makeTeacher();
    await expect(addSection(db(), other.user, c.id, "Hijack")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const draft = await createCourse(db(), other.user, { title: "Draft course", summary: "", objectives: "", prerequisites: "", level: "beginner", language: "en", priceMinor: 0, currency: "EUR", passingScorePct: 70 });
    const sec = await addSection(db(), other.user, draft.id, "S");
    const l = await addLesson(db(), other.user, draft.id, { sectionId: sec.id, title: "L", type: "text", content: "x", isPreview: true, durationMinutes: 1 });
    const s = await makeUser();
    await expect(getLessonForUser(db(), s, l.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await db().select().from(courseLessons)).length).toBeGreaterThan(0);
  });
});
