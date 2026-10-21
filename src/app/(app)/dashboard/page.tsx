import Link from "next/link";
import { and, desc, eq, inArray, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, lessonOfferings, notifications, profiles, teacherProfiles } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages";
import { fmtDateTime } from "@/lib/time";
import { Card, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";

export default async function Dashboard() {
  const user = await requireUserPage("/dashboard");
  const { t, locale } = await getI18n();
  const db = getDb();
  const upcoming = await db.select({ b: bookings, title: lessonOfferings.title, teacher: profiles.displayName }).from(bookings)
    .innerJoin(lessonOfferings, eq(lessonOfferings.id, bookings.offeringId)).innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId))
    .innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId))
    .where(and(eq(bookings.studentId, user.id), inArray(bookings.status, ["confirmed", "in_progress", "slot_held", "awaiting_payment"]), gte(bookings.endsAt, new Date())))
    .orderBy(bookings.startsAt).limit(5);
  const notes = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(5);
  return (
    <div className="space-y-6">
      <PageHeader title={fmt(t.dashboard.welcome, { name: user.displayName })} actions={<LinkButton href="/teachers">{t.nav.findTeachers}</LinkButton>} />
      <Card>
        <h2 className="mb-3 font-semibold">{t.lessons.upcoming}</h2>
        {upcoming.length === 0 ? <EmptyState title={t.dashboard.noUpcoming} action={<LinkButton href="/teachers" variant="secondary">{t.lessons.findTeacher}</LinkButton>} /> : (
          <ul className="divide-y divide-line">{upcoming.map((u) => (
            <li key={u.b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div><Link href={`/lessons/${u.b.id}`} className="font-medium hover:underline">{u.title}</Link><p className="text-sm text-muted">{u.teacher} · {fmtDateTime(u.b.startsAt, user.timezone, locale)}</p></div>
              <StatusBadge status={u.b.status} label={t.booking.statuses[u.b.status]} />
            </li>))}</ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">{t.dashboard.recentNotifications}</h2>
        {notes.length === 0 ? <p className="text-sm text-muted">{t.common.empty}</p> : (
          <ul className="space-y-2 text-sm">{notes.map((n) => <li key={n.id}>{n.link ? <Link className="hover:underline" href={n.link}>{n.title}</Link> : n.title} <span className="text-muted">— {n.body}</span></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
