import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { requireTeacher } from "@/lib/services/teachers";
import { listTeacherBookings } from "@/lib/services/bookings";
import { getI18n } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { Card, EmptyState, PageHeader, StatusBadge, DemoBadge } from "@/components/ui";

export default async function TeacherBookings() {
  const user = await requireUserPage("/teach/bookings");
  const { t, locale } = await getI18n();
  const db = getDb();
  const tp = await requireTeacher(db, user.id);
  const rows = await listTeacherBookings(db, tp.id);
  return (
    <div>
      <PageHeader title={t.nav.bookings} />
      {rows.length === 0 ? <EmptyState title={t.common.empty} body="Bookings appear here once students reserve your slots." /> : (
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-muted"><th className="py-2 text-start">{t.common.date}</th><th className="text-start">Student</th><th className="text-start">Lesson</th><th className="text-start">{t.common.total}</th><th className="text-start">{t.common.status}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.b.id} className="border-t border-line"><td className="py-2"><Link className="hover:underline" href={`/teach/bookings/${r.b.id}`}>{fmtDateTime(r.b.startsAt, user.timezone, locale)}</Link></td><td>{r.studentName} {r.b.isDemo && <DemoBadge label={t.common.demo} />}</td><td>{r.title}</td>
              <td>{r.b.priceMinor === 0 ? t.common.free : formatMoney(r.b.priceMinor, r.b.currency, locale)}</td><td><StatusBadge status={r.b.status} label={t.booking.statuses[r.b.status]} /></td></tr>))}</tbody>
        </table></Card>
      )}
    </div>
  );
}
