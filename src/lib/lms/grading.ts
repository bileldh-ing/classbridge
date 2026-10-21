/** Pure LMS rules: objective quiz scoring and course completion / certificate eligibility. */
export type QuestionKey = { id: string; points: number; correctOptionIds: string[] };

export function gradeQuiz(questions: QuestionKey[], answers: Record<string, string[] | undefined>, passingPct: number) {
  const total = questions.reduce((a, q) => a + q.points, 0);
  let earned = 0;
  const perQuestion: Record<string, boolean> = {};
  for (const q of questions) {
    const given = [...new Set(answers[q.id] ?? [])].sort();
    const correct = [...q.correctOptionIds].sort();
    const ok = given.length === correct.length && given.every((g, i) => g === correct[i]);
    perQuestion[q.id] = ok;
    if (ok) earned += q.points;
  }
  const scorePct = total === 0 ? 0 : Math.floor((earned * 100) / total);
  return { scorePct, passed: total > 0 && scorePct >= passingPct, perQuestion };
}

/** A course is complete when every non-quiz lesson is marked complete and every quiz has a passing attempt. */
export function isCourseComplete(lessons: Array<{ id: string; type: string }>, completedLessonIds: Set<string>, passedQuizLessonIds: Set<string>) {
  if (lessons.length === 0) return false;
  return lessons.every((l) => (l.type === "quiz" ? passedQuizLessonIds.has(l.id) : completedLessonIds.has(l.id)));
}

export function progressPct(lessons: Array<{ id: string; type: string }>, completed: Set<string>, passed: Set<string>) {
  if (!lessons.length) return 0;
  const done = lessons.filter((l) => (l.type === "quiz" ? passed.has(l.id) : completed.has(l.id))).length;
  return Math.round((done * 100) / lessons.length);
}

/** Deterministic Fisher–Yates with a seed so a student's question order is stable within an attempt view. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
