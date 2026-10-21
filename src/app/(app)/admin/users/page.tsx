import { desc, ilike, or, sql, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { Badge, Card, inputClass, PageHeader, buttonClass } from "@/components/ui";
import { DecisionForm } from "@/components/forms/admin-forms";
import { allowed, Denied } from "../guard";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUserPage("/admin/users");
  if (!allowed(user, "admin.manage_users")) return <Denied />;
  const { q } = await searchParams;
  const db = getDb();
  const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`).slice(0, 80)}%` : null;
  const rows = await db.select({ u: users, name: profiles.displayName, roles: sql<string[]>`(SELECT array_agg(role::text) FROM user_roles r WHERE r.user_id = ${users.id})` })
    .from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(like ? or(ilike(users.email, like), ilike(profiles.displayName, like)) : undefined).orderBy(desc(users.createdAt)).limit(50);
  return (
    <div>
      <PageHeader title="Users" subtitle="Minimal personal data shown. Suspension revokes all sessions and is audited." />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search email or name" className={inputClass} aria-label="Search users" /><button className={buttonClass("secondary")}>Search</button></form>
      <div className="space-y-3">{rows.map((r) => (
        <Card key={r.u.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2"><strong>{r.name}</strong><span className="text-sm text-muted">{r.u.email}</span>{(r.roles ?? []).map((x) => <Badge key={x}>{x}</Badge>)}<Badge tone={r.u.status === "active" ? "success" : "danger"}>{r.u.status}</Badge>{r.u.isDemo && <Badge tone="demo">DEMO</Badge>}</div>
          {r.u.id !== user.id && <DecisionForm endpoint={`/api/admin/users/${r.u.id}/status`} options={r.u.status === "active" ? [{ value: "suspended", label: "Suspend", field: "status", variant: "danger" }] : [{ value: "active", label: "Reactivate", field: "status" }]} />}
        </Card>))}</div>
    </div>
  );
}
