import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userReports, supportTickets } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DecisionForm } from "@/components/forms/admin-forms";
import { allowed, Denied } from "../guard";

export default async function AdminReports() {
  const user = await requireUserPage("/admin/reports");
  if (!allowed(user, "admin.manage_reports")) Denied();
  const db = getDb();
  const rows = await db.select().from(userReports).where(inArray(userReports.status, ["open", "reviewing"])).orderBy(desc(userReports.createdAt)).limit(100);
  const tickets = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(50);
  return (
    <div className="space-y-6">
      <PageHeader title="Reports & moderation" subtitle="Reports never auto-hide content; moderators decide, with a note recorded in the audit log." />
      {rows.length === 0 ? <EmptyState title="No open reports" /> : rows.map((r) => (
        <Card key={r.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone="warn">{r.reason}</Badge><span className="text-sm">{r.targetType} · <span className="font-mono text-xs">{r.targetId}</span></span><Badge>{r.status}</Badge></div>
          {r.details && <p className="mb-2 text-sm">{r.details}</p>}
          <DecisionForm endpoint={`/api/admin/reports/${r.id}`} reasonKey="note" extra={{ hideReview: r.targetType === "review" }}
            options={[{ value: "reviewing", label: "Mark reviewing", field: "status" }, { value: "actioned", label: r.targetType === "review" ? "Action (hide review)" : "Mark actioned", field: "status", variant: "danger" }, { value: "dismissed", label: "Dismiss", field: "status" }]} />
        </Card>))}
      <div><h2 className="mb-2 font-semibold">Support tickets</h2>{tickets.length === 0 ? <EmptyState title="No tickets" /> : <Card><ul className="text-sm">{tickets.map((x) => <li key={x.id}>{x.subject} — <Badge>{x.status}</Badge></li>)}</ul></Card>}</div>
    </div>
  );
}
