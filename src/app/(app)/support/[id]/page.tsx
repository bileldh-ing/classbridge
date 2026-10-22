import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { getTicket } from "@/lib/services/support";
import { isAppError } from "@/lib/errors";
import { Badge, Card, PageHeader } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUserPage(`/support/${id}`);
  let d;
  try { d = await getTicket(getDb(), user, id); } catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={d.ticket.subject} subtitle={<span className="flex gap-2"><Badge>{d.ticket.category}</Badge><Badge>{d.ticket.status}</Badge></span>} />
      <ol className="space-y-2">{d.messages.map((m) => (
        <li key={m.id}><Card className={m.fromRequester ? "" : "border-brand-200 bg-brand-50"}>
          <p className="whitespace-pre-line text-sm">{m.body}</p>
          <p className="mt-1 text-xs text-muted">{m.fromRequester ? "You" : `${m.author} · ClassBridge support`} · {m.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
        </Card></li>))}</ol>
      {d.ticket.status !== "closed" && <Card><JsonForm endpoint={`/api/support/tickets/${id}/replies`} submitLabel="Reply" fields={[{ name: "body", label: "Your reply", type: "textarea", required: true }]} /></Card>}
    </div>
  );
}
