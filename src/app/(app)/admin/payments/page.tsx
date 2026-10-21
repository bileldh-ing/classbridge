import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { providerWebhookEvents, emailOutbox } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { allowed, Denied } from "../guard";

export default async function AdminPayments() {
  const user = await requireUserPage("/admin/payments");
  if (!allowed(user, "admin.view_payments")) return <Denied />;
  const db = getDb();
  const rows = await db.select().from(providerWebhookEvents).orderBy(desc(providerWebhookEvents.receivedAt)).limit(100);
  const mails = await db.select({ id: emailOutbox.id, template: emailOutbox.template, status: emailOutbox.status, attempts: emailOutbox.attempts, createdAt: emailOutbox.createdAt, lastError: emailOutbox.lastError }).from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(30);
  return (
    <div className="space-y-6">
      <PageHeader title="Payment webhook log" subtitle="Verified provider events, stored once per (provider, event id). Failed events are retried by the provider." />
      {rows.length === 0 ? <EmptyState title="No webhook events received yet" body="Configure STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET and point Stripe to /api/payments/webhook/stripe." /> : (
        <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted"><th className="py-2 text-start">Received</th><th className="text-start">Provider</th><th className="text-start">Event</th><th className="text-start">Type</th><th className="text-start">Status</th><th className="text-start">Error</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-2">{r.receivedAt.toISOString().slice(0, 19).replace("T", " ")}</td><td>{r.provider}</td><td className="font-mono text-xs">{r.eventId}</td><td>{r.type}</td><td><Badge tone={r.status === "failed" ? "danger" : r.status === "processed" ? "success" : "neutral"}>{r.status}</Badge></td><td className="text-red-700">{r.error}</td></tr>)}</tbody></table></Card>
      )}
      <div><h2 className="mb-2 font-semibold">Email delivery log</h2>
        <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted"><th className="py-2 text-start">Created</th><th className="text-start">Template</th><th className="text-start">Status</th><th className="text-start">Attempts</th><th className="text-start">Error</th></tr></thead>
          <tbody>{mails.map((m) => <tr key={m.id} className="border-t border-line"><td className="py-2">{m.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td><td>{m.template}</td><td><Badge>{m.status}</Badge></td><td>{m.attempts}</td><td className="text-red-700">{m.lastError}</td></tr>)}</tbody></table></Card></div>
    </div>
  );
}
