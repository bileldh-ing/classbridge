import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { refunds } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
import { allowed, Denied } from "../guard";

export default async function AdminRefunds() {
  const user = await requireUserPage("/admin/refunds");
  if (!allowed(user, "admin.manage_refunds")) Denied();
  const rows = await getDb().select().from(refunds).orderBy(desc(refunds.createdAt)).limit(100);
  return (
    <div>
      <PageHeader title="Refunds" subtitle="Refunds are executed by the payment provider; status changes to succeeded only on a verified webhook." />
      {rows.length === 0 ? <EmptyState title="No refunds" /> : (
        <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted"><th className="py-2 text-start">Created</th><th className="text-start">Amount</th><th className="text-start">Reason</th><th className="text-start">Status</th><th className="text-start">Last error</th><th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-2">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{formatMoney(r.amountMinor, r.currency)}</td><td>{r.reason}</td><td><Badge tone={r.status === "failed" ? "danger" : r.status === "succeeded" ? "success" : "warn"}>{r.status}</Badge></td><td className="text-red-700">{r.lastError}</td>
            <td>{["requested", "failed"].includes(r.status) && <ActionButton endpoint={`/api/admin/refunds/${r.id}/submit`} label={r.status === "failed" ? "Retry" : "Send to provider"} variant="secondary" confirmText="Submit this refund to the payment provider?" />}</td></tr>)}</tbody></table></Card>
      )}
    </div>
  );
}
