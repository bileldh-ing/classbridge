import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { courseBuilderData } from "@/lib/services/courses";
import { listSubjects, subjectName } from "@/lib/services/catalog";
import { getI18n } from "@/lib/i18n/server";
import { isAppError } from "@/lib/errors";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
import { CourseForm, LessonForm, QuestionForm, SectionForm } from "@/components/courses/client";

export default async function CourseBuilder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/teach/courses/${id}`);
  const { locale } = await getI18n();
  const db = getDb();
  let d;
  try { d = await courseBuilderData(db, user, id); } catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  const subs = (await listSubjects(db)).map((s) => ({ id: s.id, name: subjectName(s, locale) }));
  const c = d.course;
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={c.title} subtitle={<span><Badge>{c.status}</Badge> · <Link className="underline" href={`/courses/${c.slug}`}>Preview public page</Link> · <Link className="underline" href={`/my-courses/${c.id}/assignments`}>Assignments, grading & announcements</Link></span>}
        actions={<div className="flex gap-2">{c.status !== "published" ? <ActionButton endpoint={`/api/teacher/courses/${c.id}/status`} body={{ status: "published" }} label="Publish" /> : <ActionButton endpoint={`/api/teacher/courses/${c.id}/status`} body={{ status: "draft" }} label="Unpublish" variant="secondary" />}</div>} />
      <Card><h2 className="mb-3 font-semibold">Details</h2><CourseForm id={c.id} subjects={subs} initial={c} /></Card>
      <Card><h2 className="mb-3 font-semibold">Curriculum</h2>
        {d.sections.map((s) => (
          <div key={s.id} className="mb-5 border-b border-line pb-4">
            <h3 className="font-semibold">{s.title}</h3>
            <ul className="mt-2 space-y-1 text-sm">{s.lessons.map((l) => {
              const q = d.quizzes.find((x) => x.lessonId === l.id);
              return (
                <li key={l.id} className="rounded-md bg-canvas p-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{l.title}</span><Badge>{l.type}</Badge>{l.isPreview && <Badge tone="brand">preview</Badge>}
                    <span className="ms-auto flex gap-1"><ActionButton endpoint={`/api/teacher/courses/${c.id}/move`} body={{ lessonId: l.id, dir: "up" }} label="↑" variant="ghost" /><ActionButton endpoint={`/api/teacher/courses/${c.id}/move`} body={{ lessonId: l.id, dir: "down" }} label="↓" variant="ghost" /></span></div>
                  {q && <div className="mt-1"><p className="text-xs text-muted">{q.questions} question(s)</p><QuestionForm courseId={c.id} quizId={q.id} /></div>}
                </li>);
            })}</ul>
            <LessonForm courseId={c.id} sectionId={s.id} />
          </div>
        ))}
        <SectionForm courseId={c.id} />
      </Card>
      <Card><h2 className="mb-2 font-semibold">Learners ({d.learners.length})</h2>
        {d.learners.length === 0 ? <p className="text-sm text-muted">No learners yet.</p> : <ul className="text-sm">{d.learners.map((l, i) => <li key={i}>{l.name} {l.completedAt ? <Badge tone="success">completed</Badge> : null}</li>)}</ul>}</Card>
    </div>
  );
}
