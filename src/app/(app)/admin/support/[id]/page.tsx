import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { getTicket, TICKET_STATUSES } from "@/lib/services/support";
import { isAppError } from "@/lib/errors";
import { Badge, Card, PageHeader } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";
import { allowed, Denied } from "../../guard";

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUserPage(`/admin/support/${id}`);
  if (!allowed(user, "support.manage_tickets")) Denied();
  let d;
  try { d = await getTicket(getDb(), user, id); } catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <PageHeader title={d.ticket.subject} subtitle={`${d.requester?.name ?? ""} · ${d.ticket.category} · severity ${d.ticket.severity}`} />
        <ol className="space-y-2">{d.messages.map((m) => (
          <li key={m.id}><Card className={m.isInternal ? "border-amber-300 bg-amber-50" : m.fromRequester ? "" : "bg-brand-50"}>
            {m.isInternal && <Badge tone="warn">Internal note — never shown to the user</Badge>}
            <p className="whitespace-pre-line text-sm">{m.body}</p>
            <p className="mt-1 text-xs text-muted">{m.author} · {m.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
          </Card></li>))}</ol>
        <Card><JsonForm testId="staff-reply" endpoint={`/api/support/tickets/${id}/replies`} submitLabel="Send" fields={[
          { name: "body", label: "Reply or note", type: "textarea", required: true },
          { name: "internal", label: "Internal note (staff only)", type: "checkbox" },
        ]} /></Card>
      </div>
      <Card className="h-fit space-y-2">
        <p className="text-sm">Status: <Badge>{d.ticket.status}</Badge></p>
        <JsonForm testId="ticket-status" endpoint={`/api/admin/support/${id}`} submitLabel="Update ticket" fields={[
          { name: "status", label: "Status", type: "select", defaultValue: d.ticket.status, options: TICKET_STATUSES.map((s) => ({ value: s, label: s })) },
          { name: "assignToMe", label: "Assign to me", type: "checkbox", defaultValue: !d.ticket.assignedTo },
          { name: "reason", label: "Reason (audited)", required: true },
        ]} />
      </Card>
    </div>
  );
}
