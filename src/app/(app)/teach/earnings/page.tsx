import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teacherLedgerEntries } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { requireTeacher } from "@/lib/services/teachers";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/time";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";

export default async function EarningsPage() {
  const user = await requireUserPage("/teach/earnings");
  const { t, locale } = await getI18n();
  const db = getDb();
  const tp = await requireTeacher(db, user.id);
  const totals = await db.select({ currency: teacherLedgerEntries.currency, net: sql<number>`sum(${teacherLedgerEntries.amountMinor})::int` }).from(teacherLedgerEntries).where(eq(teacherLedgerEntries.teacherId, tp.id)).groupBy(teacherLedgerEntries.currency);
  const rows = await db.select().from(teacherLedgerEntries).where(eq(teacherLedgerEntries.teacherId, tp.id)).orderBy(desc(teacherLedgerEntries.createdAt)).limit(200);
  return (
    <div className="space-y-4">
      <PageHeader title={t.nav.earnings} />
      <Alert tone="info" title="Payouts unavailable">Payout rails require a licensed provider with seller onboarding/KYC (e.g. Stripe Connect where eligible). They are not enabled on this deployment, so there is no withdraw button. The ledger below is an append-only record of verified payment events.</Alert>
      <div className="grid gap-3 sm:grid-cols-3">{totals.length === 0 ? <Card><p className="text-sm text-muted">Net: —</p></Card> : totals.map((x) => <Card key={x.currency}><p className="text-sm text-muted">Net earnings ({x.currency})</p><p className="text-2xl font-semibold">{formatMoney(x.net, x.currency, locale)}</p></Card>)}</div>
      {rows.length === 0 ? <EmptyState title={t.common.empty} body="Entries appear after a payment provider confirms a paid lesson." /> : (
        <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted"><th className="py-2 text-start">{t.common.date}</th><th className="text-start">Kind</th><th className="text-start">Amount</th><th className="text-start">Payout status</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-2">{fmtDateTime(r.createdAt, user.timezone, locale)}</td><td>{r.kind.replace(/_/g, " ")}</td><td className={r.amountMinor < 0 ? "text-red-700" : ""}>{formatMoney(r.amountMinor, r.currency, locale)}</td><td>{r.payoutStatus}</td></tr>)}</tbody></table></Card>
      )}
    </div>
  );
}
