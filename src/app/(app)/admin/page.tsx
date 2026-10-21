import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { adminMetrics } from "@/lib/services/admin";
import { providerStatus } from "@/lib/env";
import { Badge, Card, PageHeader } from "@/components/ui";

export default async function AdminHome() {
  const user = await requireUserPage("/admin");
  const m = await adminMetrics(getDb(), user);
  const p = providerStatus();
  const tiles: Array<[string, number, string?]> = [
    ["Registered users", m.users], ["Students", m.students], ["Teachers", m.teachers], ["Profiles awaiting review", m.pending_teachers, "/admin/teachers"],
    ["Credentials awaiting review", m.pending_credentials, "/admin/teachers"], ["Published teachers", m.published_teachers], ["Upcoming lessons", m.upcoming_bookings, "/admin/bookings"],
    ["Completed lessons", m.completed_bookings], ["Failed webhooks", m.failed_webhooks, "/admin/payments"], ["Open refunds", m.open_refunds, "/admin/refunds"],
    ["Open reports", m.open_reports, "/admin/reports"], ["Published courses", m.published_courses], ["Demo accounts", m.demo_users],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Admin overview" subtitle="Live counts from the database (demo data included and labelled)." />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{tiles.map(([label, n, href]) => (
        <Card key={label}><p className="text-sm text-muted">{label}</p><p className="text-2xl font-semibold">{href ? <Link className="hover:underline" href={href}>{n}</Link> : n}</p></Card>))}</div>
      <Card><h2 className="mb-2 font-semibold">Provider configuration</h2>
        <ul className="space-y-1 text-sm">
          <li>Payments: <Badge tone={p.payments ? "success" : "warn"}>{p.payments ? `stripe${p.paymentsTestMode ? " (test mode)" : " (LIVE)"}` : "not configured"}</Badge></li>
          <li>Live classroom: <Badge tone={p.classroom ? "success" : "warn"}>{p.classroom ?? "not configured"}</Badge></li>
          <li>Geocoding: <Badge tone={p.geocoding ? "success" : "warn"}>{p.geocoding ?? "not configured — city list fallback"}</Badge></li>
          <li>Email: <Badge tone={p.email ? "success" : "warn"}>{p.email ?? (p.devOutbox ? "not configured — dev outbox at /dev/outbox" : "not configured")}</Badge></li>
        </ul></Card>
    </div>
  );
}
