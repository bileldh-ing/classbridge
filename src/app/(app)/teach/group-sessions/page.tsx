import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { lessonOfferings } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { getTeacherByUser } from "@/lib/services/teachers";
import { listGroupSessions } from "@/lib/services/group-lessons";
import { isEnabled } from "@/lib/services/flags";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";

export default async function GroupSessionsPage() {
  const user = await requireUserPage("/teach/group-sessions");
  const db = getDb();
  const t = await getTeacherByUser(db, user.id);
  if (!t) return <Alert tone="info">Create your teacher profile first.</Alert>;
  if (!(await isEnabled(db, "group_lessons"))) return <div><PageHeader title="Group sessions" /><Alert tone="info">Group lessons are not enabled on this deployment.</Alert></div>;
  const offerings = await db.select().from(lessonOfferings).where(and(eq(lessonOfferings.teacherId, t.id), eq(lessonOfferings.type, "group"), eq(lessonOfferings.status, "published")));
  const sessions = await listGroupSessions(db, t.id);
  return (
    <div className="space-y-4">
      <PageHeader title="Group sessions" subtitle="Schedule sessions for your group offerings. Students book seats until capacity is reached." />
      {offerings.length === 0 ? <Alert tone="info">Publish an offering of type “group” with a capacity of 2 or more first (Offerings).</Alert> : (
        <Card><JsonForm endpoint="/api/teacher/group-sessions" submitLabel="Schedule session" fields={[
          { name: "offeringId", label: "Group offering", type: "select", options: offerings.map((o) => ({ value: o.id, label: `${o.title} (${o.capacity} seats, ${o.durationMinutes} min)` })) },
          { name: "startsAt", label: "Start (your device's time zone)", type: "datetime", required: true },
        ]} /></Card>
      )}
      {sessions.length === 0 ? <EmptyState title="No upcoming sessions" /> : (
        <Card><ul className="divide-y divide-line text-sm">{sessions.map((s) => (
          <li key={s.id} className="flex justify-between py-2"><span>{s.title} — {s.startsAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span><span>{s.seatsTaken}/{s.capacity} seats</span></li>))}</ul></Card>
      )}
    </div>
  );
}
