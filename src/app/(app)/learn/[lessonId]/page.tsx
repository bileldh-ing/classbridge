import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courseLessons, lessonProgress } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { getLessonForUser } from "@/lib/services/courses";
import { isAppError } from "@/lib/errors";
import { Alert, buttonClass, Card, PageHeader } from "@/components/ui";
import { CompleteLessonButton, QuizRunner } from "@/components/courses/client";

export default async function LessonPlayer({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(lessonId)) notFound();
  const user = await requireUserPage(`/learn/${lessonId}`);
  const db = getDb();
  let d;
  try { d = await getLessonForUser(db, user, lessonId); }
  catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    if (isAppError(e) && e.code === "FORBIDDEN") return <Alert tone="warn" title="Locked">{e.message}</Alert>;
    throw e;
  }
  const all = await db.select({ id: courseLessons.id, title: courseLessons.title }).from(courseLessons).where(eq(courseLessons.courseId, d.course.id)).orderBy(asc(courseLessons.position));
  const i = all.findIndex((l) => l.id === lessonId);
  const done = (await db.select().from(lessonProgress).where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, lessonId)))).length > 0;
  const l = d.lesson;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <PageHeader title={l.title} subtitle={<Link className="underline" href={`/courses/${d.course.slug}`}>{d.course.title}</Link>} />
        <Card className="space-y-3">
          {l.content && <div className="whitespace-pre-line text-sm leading-relaxed">{l.content}</div>}
          {l.externalUrl && <p><a className="text-brand-700 underline" href={l.externalUrl} target="_blank" rel="noopener noreferrer nofollow">{l.type === "video" ? "Open video" : "Open resource"} ↗</a></p>}
          {l.type === "quiz" && d.quiz && <QuizRunner quiz={d.quiz} />}
          {l.type !== "quiz" && d.enrolled && <CompleteLessonButton lessonId={l.id} done={done} />}
          {!d.enrolled && !d.isOwner && <Alert tone="info">Preview lesson. Enroll to track progress.</Alert>}
        </Card>
        <div className="flex justify-between">
          {i > 0 ? <Link className={buttonClass("secondary")} href={`/learn/${all[i - 1].id}`}>← {all[i - 1].title}</Link> : <span />}
          {i < all.length - 1 ? <Link className={buttonClass("secondary")} href={`/learn/${all[i + 1].id}`}>{all[i + 1].title} →</Link> : <span />}
        </div>
      </div>
      <nav aria-label="Course lessons" className="text-sm"><ol className="space-y-1">{all.map((x, j) => <li key={x.id}><Link className={`block rounded px-2 py-1 ${x.id === lessonId ? "bg-brand-50 font-medium" : "hover:bg-canvas"}`} href={`/learn/${x.id}`}>{j + 1}. {x.title}</Link></li>)}</ol></nav>
    </div>
  );
}
