import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { currentUser } from "@/lib/auth/session";
import { getCourseForViewer } from "@/lib/services/courses";
import { formatMoney } from "@/lib/money";
import { providerStatus } from "@/lib/env";
import { Alert, Badge, Card, DemoBadge, LinkButton, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
import { Lock, PlayCircle } from "lucide-react";

export default async function CoursePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const user = await currentUser();
  const d = await getCourseForViewer(getDb(), slug, user);
  if (!d) notFound();
  const c = d.course;
  const first = d.sections.flatMap((s) => s.lessons)[0];
  const resume = d.enrollment?.lastLessonId ?? first?.id;
  const paid = c.priceMinor > 0;
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {c.isDemo && <Alert tone="info">Demo course created for development.</Alert>}
        {sp.checkout === "success" && <Alert tone="info">Payment submitted — access is granted as soon as the payment provider confirms it.</Alert>}
        <PageHeader title={c.title} subtitle={<span>{t.lessons.with} <Link className="underline" href={`/teachers/${d.teacherSlug}`}>{d.teacherName}</Link></span>} actions={c.isDemo ? <DemoBadge label={t.common.demo} /> : null} />
        <p className="text-muted">{c.summary}</p>
        {c.objectives && <Card><h2 className="mb-1 font-semibold">Objectives</h2><p className="whitespace-pre-line text-sm">{c.objectives}</p></Card>}
        {c.prerequisites && <Card><h2 className="mb-1 font-semibold">Prerequisites</h2><p className="whitespace-pre-line text-sm">{c.prerequisites}</p></Card>}
        <Card><h2 className="mb-3 font-semibold">Curriculum</h2>
          {d.sections.map((s) => (
            <div key={s.id} className="mb-3"><h3 className="text-sm font-semibold">{s.title}</h3>
              <ul className="mt-1 space-y-1 text-sm">{s.lessons.map((l) => {
                const open = d.enrollment || d.isOwner || l.isPreview;
                return <li key={l.id} className="flex items-center gap-2">{open ? <PlayCircle aria-hidden className="size-4 text-brand-600" /> : <Lock aria-hidden className="size-4 text-muted" />}
                  {open ? <Link className="hover:underline" href={`/learn/${l.id}`}>{l.title}</Link> : <span>{l.title}</span>}<Badge>{l.type}</Badge>{l.isPreview && <Badge tone="brand">preview</Badge>}<span className="text-xs text-muted">{l.durationMinutes} {t.common.minutes}</span></li>;
              })}</ul></div>))}
        </Card>
        <Card><h2 className="mb-1 font-semibold">Completion & certificate</h2><p className="text-sm text-muted">Complete every lesson and pass every quiz (pass mark set per quiz) to receive a certificate with a public verification code. Refunds for paid courses follow the provider-backed refund process.</p></Card>
      </div>
      <aside className="lg:sticky lg:top-20 lg:self-start"><Card className="space-y-3">
        <p className="text-2xl font-semibold">{paid ? formatMoney(c.priceMinor, c.currency, locale) : t.common.free}</p>
        {d.progress && <div><div className="h-2 rounded bg-line"><div className="h-2 rounded bg-brand-600" style={{ width: `${d.progress.pct}%` }} /></div><p className="mt-1 text-xs text-muted">{d.progress.pct}% complete</p></div>}
        {d.certificate && <Alert tone="success"><Link className="underline" href={`/certificates/${d.certificate.code}`}>Certificate {d.certificate.code}</Link></Alert>}
        {d.enrollment || d.isOwner ? (resume ? <LinkButton href={`/learn/${resume}`} className="w-full">{d.enrollment?.lastLessonId ? "Resume" : "Start"}</LinkButton> : null)
          : !user ? <LinkButton className="w-full" href={`/signin?next=/courses/${slug}`}>{t.nav.signIn}</LinkButton>
          : paid && !providerStatus().payments ? <Alert tone="warn">{t.booking.paymentNotConfigured}</Alert>
          : <ActionButton endpoint={`/api/courses/${c.id}/enroll`} label={paid ? t.booking.payWith.replace("{amount}", formatMoney(c.priceMinor, c.currency, locale)) : "Enroll for free"} className="w-full" />}
      </Card></aside>
    </div>
  );
}
