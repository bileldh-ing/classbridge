import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles, teacherCredentials, teacherProfiles, users } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { Badge, Card, EmptyState, PageHeader, DemoBadge } from "@/components/ui";
import { DecisionForm } from "@/components/forms/admin-forms";
import { allowed, Denied } from "../guard";

export default async function VerificationQueue() {
  const user = await requireUserPage("/admin/teachers");
  if (!allowed(user, "admin.verify_teachers")) Denied();
  const db = getDb();
  const pending = await db.select({ t: teacherProfiles, name: profiles.displayName, email: users.email }).from(teacherProfiles)
    .innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId)).innerJoin(users, eq(users.id, teacherProfiles.userId))
    .where(eq(teacherProfiles.publishState, "pending_review")).orderBy(teacherProfiles.updatedAt);
  const creds = await db.select({ c: teacherCredentials, name: profiles.displayName }).from(teacherCredentials)
    .innerJoin(teacherProfiles, eq(teacherProfiles.id, teacherCredentials.teacherId)).innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId))
    .where(inArray(teacherCredentials.status, ["submitted"])).orderBy(desc(teacherCredentials.createdAt));
  const published = await db.select({ t: teacherProfiles, name: profiles.displayName }).from(teacherProfiles).innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId)).where(eq(teacherProfiles.publishState, "published")).limit(50);
  return (
    <div className="space-y-6">
      <PageHeader title="Teacher verification" subtitle="Every decision requires a reason and is written to the append-only audit log. Uploading a file never grants a badge by itself." />
      <section><h2 className="mb-2 font-semibold">Profiles awaiting review ({pending.length})</h2>
        {pending.length === 0 ? <EmptyState title="Queue is empty" /> : pending.map((p) => (
          <Card key={p.t.id} className="mb-3">
            <div className="mb-2 flex flex-wrap items-center gap-2"><strong>{p.name}</strong><span className="text-sm text-muted">{p.email}</span>{p.t.isDemo && <DemoBadge label="DEMO" />}</div>
            <p className="text-sm font-medium">{p.t.headline}</p><p className="mb-3 line-clamp-4 text-sm text-muted">{p.t.bio}</p>
            <DecisionForm endpoint={`/api/admin/teachers/${p.t.id}/decision`} options={[{ value: "approve", label: "Approve & publish", field: "decision", variant: "primary" }, { value: "reject", label: "Request changes", field: "decision", variant: "danger" }]} />
          </Card>))}
      </section>
      <section><h2 className="mb-2 font-semibold">Credentials awaiting review ({creds.length})</h2>
        {creds.length === 0 ? <EmptyState title="No credentials waiting" /> : creds.map(({ c, name }) => (
          <Card key={c.id} className="mb-3">
            <p className="mb-1 text-sm"><strong>{name}</strong>: {c.title} — {c.issuer} {c.issuedYear ? `(${c.issuedYear})` : ""}</p>
            {c.fileKey ? <a className="mb-2 inline-block text-sm text-brand-700 underline" href={`/api/admin/credentials/${c.id}/file`}>Download private file (access is audited)</a> : <p className="mb-2 text-sm text-muted">No file attached.</p>}
            <DecisionForm endpoint={`/api/admin/credentials/${c.id}/decision`} options={[{ value: "approve", label: "Approve (grants “Credentials reviewed”)", field: "decision", variant: "primary" }, { value: "reject", label: "Reject", field: "decision", variant: "danger" }]} />
          </Card>))}
      </section>
      <section><h2 className="mb-2 font-semibold">Published teachers — badges</h2>
        <Card><ul className="divide-y divide-line">{published.map((p) => (
          <li key={p.t.id} className="py-3"><div className="mb-2 flex items-center gap-2"><Link className="font-medium hover:underline" href={`/teachers/${p.t.slug}`}>{p.name}</Link>{p.t.isDemo && <Badge tone="demo">DEMO</Badge>}</div>
            <DecisionForm endpoint={`/api/admin/teachers/${p.t.id}/badges`} extra={{ badge: "platform_verified" }} options={[{ value: "grant", label: "Grant “Platform verified”", field: "action" }, { value: "revoke", label: "Revoke", field: "action", variant: "danger" }]} />
          </li>))}</ul></Card>
      </section>
    </div>
  );
}
