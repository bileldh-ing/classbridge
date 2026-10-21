import Link from "next/link";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, lessonOfferings, profiles } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { getTeacherByUser, profileCompleteness } from "@/lib/services/teachers";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages";
import { fmtDateTime } from "@/lib/time";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";

export default async function TeachOverview() {
  const user = await requireUserPage("/teach");
  const { t, locale } = await getI18n();
  const db = getDb();
  const tp = await getTeacherByUser(db, user.id);
  if (!tp) return <EmptyState title={t.common.forbidden} />;
  const c = await profileCompleteness(db, tp.id);
  const upcoming = await db.select({ b: bookings, title: lessonOfferings.title, student: profiles.displayName }).from(bookings)
    .innerJoin(lessonOfferings, eq(lessonOfferings.id, bookings.offeringId)).innerJoin(profiles, eq(profiles.userId, bookings.studentId))
    .where(and(eq(bookings.teacherId, tp.id), inArray(bookings.status, ["confirmed", "in_progress"]), gte(bookings.endsAt, new Date()))).orderBy(bookings.startsAt).limit(8);
  const stateMsg = { draft: t.dashboard.draft, pending_review: t.dashboard.pendingReview, published: t.dashboard.published, rejected: t.dashboard.rejected, suspended: "Suspended" }[tp.publishState];
  return (
    <div className="space-y-6">
      <PageHeader title={t.dashboard.teacherWelcome} actions={tp.publishState === "published" ? <LinkButton href={`/teachers/${tp.slug}`} variant="secondary">{t.nav.publicProfile}</LinkButton> : null} />
      <Card>
        <h2 className="mb-2 font-semibold">{t.dashboard.profileStatus}</h2>
        <p className="mb-2"><Badge tone={tp.publishState === "published" ? "success" : tp.publishState === "rejected" ? "danger" : "warn"}>{stateMsg}</Badge></p>
        {tp.reviewNote && <Alert tone={tp.publishState === "rejected" ? "warn" : "info"}>Reviewer note: {tp.reviewNote}</Alert>}
        <div className="mt-3"><div className="h-2 w-full rounded bg-line"><div className="h-2 rounded bg-brand-600" style={{ width: `${c.percent}%` }} /></div>
          <p className="mt-1 text-sm text-muted">{fmt(t.dashboard.completeness, { pct: c.percent })}</p></div>
        {c.missing.length > 0 && <p className="mt-2 text-sm">{t.dashboard.missing}: {c.missing.join(", ")}</p>}
        {["draft", "rejected"].includes(tp.publishState) && <div className="mt-3"><ActionButton endpoint="/api/teachers/me/submit" label={t.dashboard.submitReview} /></div>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">{t.dashboard.upcomingTeaching}</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted">{t.dashboard.noUpcoming}</p> : (
          <ul className="divide-y divide-line">{upcoming.map((u) => (
            <li key={u.b.id} className="flex items-center justify-between py-2"><div><Link className="font-medium hover:underline" href={`/teach/bookings/${u.b.id}`}>{u.title}</Link><p className="text-sm text-muted">{u.student} · {fmtDateTime(u.b.startsAt, user.timezone, locale)}</p></div><StatusBadge status={u.b.status} label={t.booking.statuses[u.b.status]} /></li>))}</ul>
        )}
      </Card>
    </div>
  );
}
