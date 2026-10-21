import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { quizSubmitSchema, submitQuiz } from "@/lib/services/courses";
/** Submit an attempt (immutable once stored). Returns score + per-question correctness + explanations. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const { answers } = await parseBody(req, quizSubmitSchema);
  const r = await submitQuiz(getDb(), u, (await params).id, answers);
  return json({ scorePct: r.scorePct, passed: r.passed, perQuestion: r.perQuestion, explanations: r.explanations, attemptsUsed: r.attemptsUsed, maxAttempts: r.maxAttempts, certificateCode: r.certificate?.code ?? null }, 201);
});
