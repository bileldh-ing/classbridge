import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { MapPin, Star, Video, Users, GraduationCap, ShieldCheck } from "lucide-react";
import { getDb } from "@/lib/db";
import { savedTeachers } from "@/lib/db/schema";
import { getPublicTeacher } from "@/lib/services/teachers";
import { subjectName } from "@/lib/services/catalog";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages";
import { currentUser } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { POLICIES, isPolicyId } from "@/lib/policy/cancellation";
import { Avatar, Badge, Card, DemoBadge, Alert } from "@/components/ui";
import { BookingWidget } from "@/components/teachers/booking-widget";
import { isEnabled } from "@/lib/services/flags";
import { listGroupSessions } from "@/lib/services/group-lessons";
import { ReportButton } from "@/components/client/report-button";
import { ActionButton } from "@/components/client/action-button";
import { fmtDateTime } from "@/lib/time";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tp = await getPublicTeacher(getDb(), slug);
  if (!tp) return { title: "Teacher not found", robots: { index: false } };
  return { title: `${tp.displayName} — ${tp.headline}`, description: tp.bio.slice(0, 155), alternates: { canonical: `/teachers/${slug}` },
    openGraph: { title: tp.displayName, description: tp.headline }, robots: tp.isDemo ? { index: false } : undefined };
}

export default async function TeacherPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  const tp = await getPublicTeacher(db, slug);
  if (!tp) notFound();
  const { t, locale } = await getI18n();
  const user = await currentUser();
  const viewerTz = user?.timezone ?? "UTC";
  const saved = user ? (await db.select().from(savedTeachers).where(and(eq(savedTeachers.userId, user.id), eq(savedTeachers.teacherId, tp.id)))).length > 0 : false;
  const policy = isPolicyId(tp.cancellationPolicy) ? POLICIES[tp.cancellationPolicy] : null;
  const groupOn = await isEnabled(db, "group_lessons");
  const groupSessions = groupOn ? await listGroupSessions(db, tp.id) : [];
  const offerings = tp.offerings.filter((o) => o.type !== "group").map((o) => ({ id: o.id, title: o.title, description: o.description, durationMinutes: o.durationMinutes, mode: o.mode, type: o.type,
    priceLabel: o.priceMinor === 0 ? t.common.free : formatMoney(o.priceMinor, o.currency, locale) }));

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {tp.isDemo && <Alert tone="info">{t.common.demoNotice}</Alert>}
        <header className="flex gap-4">
          <Avatar name={tp.displayName} url={tp.avatarUrl} size={96} />
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{tp.displayName}</h1>{tp.isDemo && <DemoBadge label={t.common.demo} />}</div>
            <p className="mt-1 text-muted">{tp.headline}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-1"><Star aria-hidden className="size-4 text-amber-500" />{tp.ratingCount ? `${tp.ratingAvg?.toFixed(1)} (${fmt(t.search.reviews, { count: tp.ratingCount })})` : t.search.noReviews}</span>
              {tp.offersOnline && <span className="inline-flex items-center gap-1"><Video aria-hidden className="size-4" />{t.common.online}</span>}
              {tp.offersInPerson && <span className="inline-flex items-center gap-1"><Users aria-hidden className="size-4" />{t.common.inPerson}</span>}
              <span className="inline-flex items-center gap-1"><GraduationCap aria-hidden className="size-4" />{fmt(t.teacher.experience, { years: tp.yearsExperience })}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">{tp.badges.map((b) => <Badge key={b.badge} tone="success"><ShieldCheck aria-hidden className="size-3" />{t.teacher.badges[b.badge]}</Badge>)}</div>
            {user && user.id !== tp.userId && (
              <div className="mt-3"><ActionButton endpoint="/api/saved-teachers" method={saved ? "DELETE" : "POST"} body={{ teacherId: tp.id }} label={saved ? t.teacher.unsave : t.teacher.save} variant="secondary" /></div>
            )}
          </div>
        </header>
        <Card><h2 className="mb-2 font-semibold">{t.teacher.about}</h2><p className="whitespace-pre-line text-sm leading-relaxed">{tp.bio}</p>
          {tp.teachingApproach && <><h3 className="mb-1 mt-4 font-semibold">{t.teacher.approach}</h3><p className="whitespace-pre-line text-sm leading-relaxed">{tp.teachingApproach}</p></>}
          {tp.introVideoUrl && <p className="mt-4 text-sm"><a className="text-brand-700 underline" href={tp.introVideoUrl} rel="noopener noreferrer nofollow" target="_blank">{t.teacher.introVideo}</a></p>}
        </Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><h2 className="mb-2 text-sm font-semibold">{t.teacher.subjects}</h2><div className="flex flex-wrap gap-1">{tp.subjects.map((s) => <Badge key={s.id} tone="brand">{subjectName(s, locale)}</Badge>)}</div></Card>
          <Card><h2 className="mb-2 text-sm font-semibold">{t.teacher.levels}</h2><p className="text-sm">{tp.levels.map((l) => (t.search.levels as Record<string, string>)[l]).join(", ")}</p></Card>
          <Card><h2 className="mb-2 text-sm font-semibold">{t.teacher.languages}</h2><p className="text-sm">{tp.languages.map((l) => (t.search.languages as Record<string, string>)[l]).join(", ")}</p></Card>
        </div>
        <Card><h2 className="mb-3 font-semibold">{t.teacher.credentials}</h2>
          {tp.credentials.length === 0 ? <p className="text-sm text-muted">—</p> : (
            <ul className="space-y-2 text-sm">{tp.credentials.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2"><span>{c.title} — {c.issuer}{c.issuedYear ? ` (${c.issuedYear})` : ""}</span>
                <Badge tone={c.status === "approved" ? "success" : "neutral"}>{c.status === "approved" ? t.teacher.credentialApproved : t.teacher.credentialPending}</Badge></li>))}</ul>
          )}
        </Card>
        <Card><h2 className="mb-2 font-semibold">{t.teacher.location}</h2>
          <p className="flex items-center gap-1 text-sm"><MapPin aria-hidden className="size-4" />{tp.location ? `${tp.location.city}, ${tp.location.country} · ${t.teacher.locationApprox}` : t.teacher.onlineOnly}</p></Card>
        <Card><h2 className="mb-3 font-semibold">{t.teacher.reviews}</h2>
          {tp.reviews.length === 0 ? <p className="text-sm text-muted">{t.teacher.noReviews}</p> : (
            <ul className="space-y-4">{tp.reviews.map((r) => (
              <li key={r.id} className="border-b border-line pb-3 last:border-0">
                <div className="flex items-center gap-2 text-sm"><span className="font-medium">{r.author}</span><span aria-label={`${r.rating} / 5`} className="text-amber-500">{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></span>{r.isDemo && <DemoBadge label={t.common.demo} />}<span className="text-xs text-muted">{fmtDateTime(r.createdAt, viewerTz, locale, { dateStyle: "medium" })}</span></div>
                {r.body && <p className="mt-1 text-sm">{r.body}</p>}
                {r.teacherResponse && <p className="mt-2 rounded-md bg-canvas p-2 text-sm"><span className="font-medium">{t.teacher.teacherResponse}: </span>{r.teacherResponse}</p>}
                <div className="mt-1"><ReportButton targetType="review" targetId={r.id} label={t.teacher.report} sentLabel={t.teacher.reportSent} /></div>
              </li>))}</ul>
          )}
        </Card>
        <ReportButton targetType="teacher_profile" targetId={tp.id} label={t.teacher.report} sentLabel={t.teacher.reportSent} />
      </div>
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">{t.teacher.book}</h2>
          <BookingWidget offerings={offerings} signedIn={!!user} viewerTz={viewerTz} slug={tp.slug} isOwn={user?.id === tp.userId} />
          {groupSessions.length > 0 && (
            <section aria-labelledby="group-h" className="mt-4 rounded-xl border border-line p-4" data-testid="group-sessions">
              <h2 id="group-h" className="mb-2 font-semibold">Group sessions</h2>
              <ul className="space-y-2 text-sm">{groupSessions.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{g.title} · {fmtDateTime(g.startsAt, viewerTz, locale)} · {g.priceMinor === 0 ? t.common.free : formatMoney(g.priceMinor, g.currency, locale)} · {g.seatsLeft} seats left</span>
                  {user && user.id !== tp.userId && g.seatsLeft > 0 ? <ActionButton endpoint={`/api/group-sessions/${g.id}/seats`} body={{ timezone: viewerTz }} label="Book a seat" variant="secondary" />
                    : !user ? <a className="underline" href={`/signin?next=/teachers/${tp.slug}`}>{t.nav.signIn}</a> : null}
                </li>))}</ul>
            </section>
          )}
          {policy && <div className="mt-4 border-t border-line pt-3 text-xs text-muted"><p className="font-medium text-ink">{t.teacher.cancellation}</p><p>{policy.summary}</p></div>}
        </Card>
      </aside>
    </div>
  );
}
