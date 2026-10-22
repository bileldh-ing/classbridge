import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { listAnnouncements, listAssignments } from "@/lib/services/lms-extra";
import { isAppError } from "@/lib/errors";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";

/** Assignments (written answers) + announcements. Teachers create/grade here; learners submit and read feedback. */
export default async function AssignmentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(courseId)) notFound();
  const user = await requireUserPage(`/my-courses/${courseId}/assignments`);
  const db = getDb();
  let d, ann;
  try { d = await listAssignments(db, user, courseId); ann = await listAnnouncements(db, user, courseId); }
  catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  return (
    <div className="space-y-6">
      <PageHeader title={`${d.course.title}: assignments & announcements`} />
      {d.isOwner && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><h2 className="mb-2 font-semibold">New assignment</h2>
            <JsonForm testId="new-assignment" endpoint={`/api/teacher/courses/${courseId}/assignments`} submitLabel="Add assignment" fields={[
              { name: "title", label: "Title", required: true }, { name: "instructions", label: "Instructions", type: "textarea", required: true },
              { name: "maxPoints", label: "Max points", type: "number", defaultValue: 10, min: 1, max: 1000 }, { name: "dueAt", label: "Due (optional)", type: "datetime" },
            ]} /></Card>
          <Card><h2 className="mb-2 font-semibold">Announce to enrolled learners</h2>
            <JsonForm testId="new-announcement" endpoint={`/api/teacher/courses/${courseId}/announcements`} submitLabel="Post announcement" successText="Posted and notified." fields={[
              { name: "title", label: "Title", required: true }, { name: "body", label: "Message", type: "textarea", required: true },
            ]} /></Card>
        </div>
      )}
      <section className="space-y-2"><h2 className="font-semibold">Announcements</h2>
        {ann.length === 0 ? <EmptyState title="No announcements yet" /> : ann.map((a) => <Card key={a.id}><h3 className="font-medium">{a.title}</h3><p className="whitespace-pre-line text-sm">{a.body}</p><p className="text-xs text-muted">{a.createdAt.toISOString().slice(0, 10)}</p></Card>)}
      </section>
      <section className="space-y-3"><h2 className="font-semibold">Assignments</h2>
        {d.assignments.length === 0 ? <EmptyState title="No assignments" /> : d.assignments.map((a) => (
          <Card key={a.id} className="space-y-2" data-testid="assignment">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{a.title}</h3><Badge>{a.maxPoints} pts</Badge>{a.dueAt && <Badge tone="warn">due {a.dueAt.toISOString().slice(0, 16).replace("T", " ")} UTC</Badge>}</div>
            <p className="whitespace-pre-line text-sm">{a.instructions}</p>
            {d.isOwner ? (a.submissions.length === 0 ? <p className="text-sm text-muted">No submissions yet.</p> : a.submissions.map((s) => (
              <div key={s.id} className="rounded border border-line p-2">
                <p className="text-sm font-medium">{s.learnerName} <Badge>{s.status}{s.points !== null ? ` · ${s.points}/${a.maxPoints}` : ""}</Badge></p>
                <p className="my-1 whitespace-pre-line text-sm">{s.body}</p>
                <JsonForm endpoint={`/api/submissions/${s.id}/grade`} submitLabel={s.status === "graded" ? "Regrade (kept in history)" : "Grade"} fields={[
                  { name: "points", label: `Points (0–${a.maxPoints})`, type: "number", required: true, min: 0, max: a.maxPoints }, { name: "feedback", label: "Feedback", type: "textarea", rows: 2 },
                ]} />
              </div>))) : a.mine?.status === "graded" ? (
              <div className="rounded bg-canvas p-2 text-sm"><p><strong>Grade: {a.mine.points}/{a.maxPoints}</strong></p>{a.mine.latestFeedback && <p className="whitespace-pre-line">{a.mine.latestFeedback}</p>}<p className="mt-1 text-xs text-muted">Your answer: {a.mine.body}</p></div>
            ) : (
              <JsonForm endpoint={`/api/assignments/${a.id}/submissions`} submitLabel={a.mine ? "Update answer" : "Submit answer"} resetOnSuccess={false} successText="Saved. Your teacher will grade it." fields={[
                { name: "body", label: "Your written answer", type: "textarea", required: true, rows: 6, defaultValue: a.mine?.body },
              ]} />
            )}
          </Card>))}
      </section>
    </div>
  );
}
