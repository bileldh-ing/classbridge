import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { recentAudit } from "@/lib/services/admin";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { allowed, Denied } from "../guard";

export default async function AuditPage() {
  const user = await requireUserPage("/admin/audit");
  if (!allowed(user, "admin.view_audit")) Denied();
  const rows = await recentAudit(getDb(), user, 200);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Append-only (UPDATE/DELETE are rejected by a database trigger)." />
      {rows.length === 0 ? <EmptyState title="No audited actions yet" /> : (
        <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted"><th className="py-2 text-start">When (UTC)</th><th className="text-start">Actor</th><th className="text-start">Action</th><th className="text-start">Target</th><th className="text-start">Reason</th></tr></thead>
          <tbody>{rows.map(({ a, actorName }) => <tr key={a.id} className="border-t border-line align-top"><td className="py-2 whitespace-nowrap">{a.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td><td>{actorName ?? "system"}</td><td className="font-mono text-xs">{a.action}</td><td className="text-xs">{a.targetType} {a.targetId?.slice(0, 8)}</td><td>{a.reason}</td></tr>)}</tbody></table></Card>
      )}
    </div>
  );
}
