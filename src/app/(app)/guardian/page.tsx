import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { guardianOverview, listGuardianLinks } from "@/lib/services/guardians";
import { isEnabled } from "@/lib/services/flags";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";
import { ActionButton } from "@/components/client/action-button";

/** Family access: guardians request read-only access; learners consent and can revoke at any time. */
export default async function GuardianPage() {
  const user = await requireUserPage("/guardian");
  const db = getDb();
  if (!(await isEnabled(db, "guardian_links"))) return <div className="max-w-2xl"><PageHeader title="Family access" /><Alert tone="info">Family (guardian) access is not enabled on this ClassBridge deployment.</Alert></div>;
  const links = await listGuardianLinks(db, user);
  const active = links.filter((l) => l.role === "guardian" && l.status === "active");
  const overviews = await Promise.all(active.map((l) => guardianOverview(db, user, l.id).then((o) => ({ id: l.id, o }))));
  return (
    <div className="space-y-6">
      <PageHeader title="Family access" subtitle="A parent or guardian can follow a learner's lesson schedule and course progress — only after the learner accepts. Messages, payments and notes are never shared." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">Follow a learner</h2>
          <JsonForm testId="guardian-request" endpoint="/api/guardian/links" submitLabel="Send request" successText="Request sent. Nothing is shared until the learner accepts." fields={[
            { name: "learnerEmail", label: "Learner's ClassBridge email", type: "email", required: true },
            { name: "canViewBookings", label: "Lesson schedule and status", type: "checkbox", defaultValue: true },
            { name: "canViewProgress", label: "Course progress", type: "checkbox", defaultValue: true },
          ]} /></Card>
        <Card><h2 className="mb-2 font-semibold">Links</h2>
          {links.length === 0 ? <EmptyState title="No family links" /> : <ul className="divide-y divide-line text-sm">{links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{l.role === "guardian" ? `You follow ${l.learnerName ?? l.learnerEmail}` : `${l.guardianName} follows you`} <Badge>{l.status}</Badge></span>
              {["pending", "active"].includes(l.status) && <ActionButton endpoint={`/api/guardian/links/${l.id}/revoke`} label="Revoke" variant="ghost" confirmText="Revoke this link?" />}
            </li>))}</ul>}
        </Card>
      </div>
      {overviews.map(({ id, o }) => (
        <Card key={id}><h2 className="mb-2 font-semibold">{o.learnerName}</h2>
          {o.lessons && <><h3 className="text-sm font-medium">Lessons</h3><ul className="mb-3 text-sm">{o.lessons.map((l, i) => <li key={i}>{l.startsAt.toISOString().slice(0, 16).replace("T", " ")} UTC — {l.title} with {l.teacherName} <Badge>{l.status}</Badge></li>)}</ul></>}
          {o.progress && <><h3 className="text-sm font-medium">Courses</h3><ul className="text-sm">{o.progress.map((p, i) => <li key={i}>{p.title}: {p.done}/{p.total} lessons{p.completedAt ? " — completed" : ""}</li>)}</ul></>}
        </Card>))}
    </div>
  );
}
