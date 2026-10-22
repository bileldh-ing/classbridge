import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { listMyTickets, TICKET_CATEGORIES } from "@/lib/services/support";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const user = await requireUserPage("/support");
  const sp = await searchParams;
  const tickets = await listMyTickets(getDb(), user);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <PageHeader title="Help & support" subtitle="Our team usually replies within one business day. Safety reports are prioritised." />
        {tickets.length === 0 ? <EmptyState title="No tickets yet" /> : (
          <Card><ul className="divide-y divide-line">{tickets.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <Link className="underline" href={`/support/${t.id}`}>{t.subject}</Link>
              <span className="flex gap-1"><Badge>{t.category}</Badge><Badge tone={t.status === "open" ? "warn" : t.status === "pending" ? "brand" : "success"}>{t.status}</Badge></span>
            </li>))}</ul></Card>
        )}
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">New ticket</h2>
        <JsonForm testId="new-ticket" endpoint="/api/support/tickets" submitLabel="Send to support" extra={sp.booking && /^[0-9a-f-]{36}$/.test(sp.booking) ? { bookingId: sp.booking } : undefined} fields={[
          { name: "category", label: "Topic", type: "select", defaultValue: sp.booking ? "booking" : "general", options: TICKET_CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })) },
          { name: "subject", label: "Subject", required: true },
          { name: "body", label: "How can we help?", type: "textarea", required: true, rows: 6 },
        ]} />
      </Card>
    </div>
  );
}
