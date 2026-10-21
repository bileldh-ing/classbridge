import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { listStudentBookings } from "@/lib/services/bookings";
import { getI18n } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/time";
import { UPCOMING_STATUSES } from "@/lib/booking/state-machine";
import { Card, EmptyState, LinkButton, PageHeader, StatusBadge, DemoBadge } from "@/components/ui";

export default async function LessonsPage() {
  const user = await requireUserPage("/lessons");
  const { t, locale } = await getI18n();
  const rows = await listStudentBookings(getDb(), user.id);
  // eslint-disable-next-line react-hooks/purity -- dynamic server component: rendered per request, reading the clock is intended
  const now = Date.now();
  const upcoming = rows.filter((r) => UPCOMING_STATUSES.includes(r.b.status) && r.b.endsAt.getTime() > now).reverse();
  const other = rows.filter((r) => !upcoming.includes(r));
  const renderList = (items: typeof rows) => (
    <ul className="divide-y divide-line">{items.map((r) => (
      <li key={r.b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div><Link href={`/lessons/${r.b.id}`} className="font-medium hover:underline">{r.title}</Link> {r.b.isDemo && <DemoBadge label={t.common.demo} />}
          <p className="text-sm text-muted">{r.teacherName} · {fmtDateTime(r.b.startsAt, user.timezone, locale)}</p></div>
        <StatusBadge status={r.b.status} label={t.booking.statuses[r.b.status]} />
      </li>))}</ul>
  );
  return (
    <div className="space-y-6">
      <PageHeader title={t.lessons.title} />
      {rows.length === 0 ? <EmptyState title={t.lessons.empty} action={<LinkButton href="/teachers">{t.lessons.findTeacher}</LinkButton>} /> : (
        <>
          <Card><h2 className="mb-2 font-semibold">{t.lessons.upcoming}</h2>{upcoming.length ? renderList(upcoming) : <p className="text-sm text-muted">{t.dashboard.noUpcoming}</p>}</Card>
          <Card><h2 className="mb-2 font-semibold">{t.lessons.past}</h2>{other.length ? renderList(other) : <p className="text-sm text-muted">{t.common.empty}</p>}</Card>
        </>
      )}
    </div>
  );
}
