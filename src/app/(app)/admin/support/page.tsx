import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { supportQueue } from "@/lib/services/support";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { allowed, Denied } from "../guard";

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUserPage("/admin/support");
  if (!allowed(user, "support.manage_tickets")) Denied();
  const sp = await searchParams;
  const status = sp.status === "done" ? ["resolved", "closed"] : ["open", "pending"];
  const rows = await supportQueue(getDb(), user, status);
  return (
    <div className="space-y-4">
      <PageHeader title="Support queue" subtitle="High-severity (safety) tickets first, then oldest first." actions={<span className="flex gap-3 text-sm"><Link className="underline" href="/admin/support">Open</Link><Link className="underline" href="/admin/support?status=done">Resolved</Link></span>} />
      {rows.length === 0 ? <EmptyState title="Queue is empty" /> : (
        <Card><table className="w-full text-sm"><thead><tr className="text-start text-muted"><th className="text-start">Subject</th><th className="text-start">From</th><th className="text-start">Category</th><th className="text-start">Status</th><th className="text-start">Opened</th></tr></thead>
          <tbody>{rows.map(({ t, requester }) => (
            <tr key={t.id} className="border-t border-line"><td className="py-2"><Link className="underline" href={`/admin/support/${t.id}`}>{t.subject}</Link> {t.severity === "high" && <Badge tone="danger">high</Badge>}</td>
              <td>{requester}</td><td>{t.category}</td><td><Badge>{t.status}</Badge></td><td>{t.createdAt.toISOString().slice(0, 10)}</td></tr>))}</tbody></table></Card>
      )}
    </div>
  );
}
