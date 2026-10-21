import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orderItems, orders, refunds, paymentIntents } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { providerStatus } from "@/lib/env";
import { Alert } from "@/components/ui";

export default async function PaymentsPage() {
  const user = await requireUserPage("/payments");
  const { t, locale } = await getI18n();
  const db = getDb();
  const rows = await db.select({ o: orders, item: orderItems }).from(orders).innerJoin(orderItems, eq(orderItems.orderId, orders.id)).where(eq(orders.buyerId, user.id)).orderBy(desc(orders.createdAt)).limit(100);
  const rf = await db.select({ r: refunds }).from(refunds).innerJoin(paymentIntents, eq(paymentIntents.id, refunds.paymentIntentId)).innerJoin(orders, eq(orders.id, paymentIntents.orderId)).where(eq(orders.buyerId, user.id));
  return (
    <div className="space-y-4">
      <PageHeader title={t.nav.payments} />
      {!providerStatus().payments && <Alert tone="info">{t.booking.paymentNotConfigured}</Alert>}
      {rows.length === 0 ? <EmptyState title={t.common.empty} /> : (
        <Card><table className="w-full text-sm"><thead><tr className="text-start text-muted"><th className="py-2 text-start">{t.common.date}</th><th className="text-start">{t.common.details}</th><th className="text-start">{t.common.total}</th><th className="text-start">{t.common.status}</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.item.id} className="border-t border-line"><td className="py-2">{fmtDateTime(r.o.createdAt, user.timezone, locale)}</td><td>{r.item.description}</td><td>{formatMoney(r.o.totalMinor, r.o.currency, locale)}</td><td><Badge>{r.o.status}</Badge></td></tr>)}</tbody></table></Card>
      )}
      {rf.length > 0 && <Card><h2 className="mb-2 font-semibold">Refunds</h2><ul className="text-sm">{rf.map(({ r }) => <li key={r.id}>{formatMoney(r.amountMinor, r.currency, locale)} — <Badge>{r.status}</Badge> {r.lastError && <span className="text-red-700">{r.lastError}</span>}</li>)}</ul></Card>}
    </div>
  );
}
