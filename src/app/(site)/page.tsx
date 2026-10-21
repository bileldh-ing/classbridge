import Link from "next/link";
import { Search, Video, MapPin, ShieldCheck, CalendarCheck, GraduationCap } from "lucide-react";
import { getDb } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { listSubjects, subjectName } from "@/lib/services/catalog";
import { searchTeachers } from "@/lib/services/teacher-search";
import { teacherSearchSchema } from "@/lib/validation/search";
import { TeacherCardView } from "@/components/teachers/teacher-card";
import { buttonClass, Card, LinkButton } from "@/components/ui";
import { currentUser } from "@/lib/auth/session";

export default async function Home() {
  const { t, locale } = await getI18n();
  const db = getDb();
  const user = await currentUser();
  const [subjects, featured] = await Promise.all([listSubjects(db), searchTeachers(db, teacherSearchSchema.parse({ pageSize: "4", sort: "rating" }), locale)]);
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center md:py-24">
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{t.home.heroTitle}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted md:text-lg">{t.home.heroSubtitle}</p>
          <form action="/teachers" method="get" className="mx-auto mt-8 flex max-w-2xl gap-2" role="search">
            <label htmlFor="hero-q" className="sr-only">{t.common.search}</label>
            <input id="hero-q" name="q" placeholder={t.home.searchPlaceholder} className="min-h-12 flex-1 rounded-xl border border-line bg-white px-4 text-base shadow-sm focus:border-brand-500" />
            <button className={buttonClass("primary", "min-h-12 px-6")}><Search aria-hidden className="size-4" />{t.common.search}</button>
          </form>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {subjects.slice(0, 8).map((s) => <Link key={s.id} href={`/subjects/${s.slug}`} className="rounded-full border border-line bg-white px-3 py-1 text-sm hover:border-brand-500">{subjectName(s, locale)}</Link>)}
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-12 md:grid-cols-2">
        <Card className="flex gap-4"><Video aria-hidden className="size-8 shrink-0 text-brand-600" /><div><h2 className="font-semibold">{t.home.onlineTitle}</h2><p className="text-sm text-muted">{t.home.onlineBody}</p><Link className="mt-2 inline-block text-sm text-brand-700 underline" href="/teachers?mode=online">{t.nav.findTeachers}</Link></div></Card>
        <Card className="flex gap-4"><MapPin aria-hidden className="size-8 shrink-0 text-brand-600" /><div><h2 className="font-semibold">{t.home.inPersonTitle}</h2><p className="text-sm text-muted">{t.home.inPersonBody}</p><Link className="mt-2 inline-block text-sm text-brand-700 underline" href="/teachers?mode=in_person&view=map">{t.search.map}</Link></div></Card>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-6 text-2xl font-semibold">{t.home.howTitle}</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {[[Search, t.home.step1, t.home.step1Body], [CalendarCheck, t.home.step2, t.home.step2Body], [GraduationCap, t.home.step3, t.home.step3Body]].map(([Icon, title, body], i) => {
            const I = Icon as typeof Search;
            return <li key={i}><Card><I aria-hidden className="mb-2 size-6 text-brand-600" /><h3 className="font-semibold">{i + 1}. {title as string}</h3><p className="mt-1 text-sm text-muted">{body as string}</p></Card></li>;
          })}
        </ol>
      </section>
      {featured.items.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-semibold">{t.home.featured}</h2><Link href="/teachers" className="text-sm text-brand-700 underline">{t.common.viewAll}</Link></div>
          <div className="grid gap-3 md:grid-cols-2">{featured.items.map((c) => <TeacherCardView key={c.id} c={c} t={t} locale={locale} viewerTz={user?.timezone ?? "UTC"} />)}</div>
        </section>
      )}
      <section className="mx-auto max-w-7xl px-4 py-8">
        <Card className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3"><ShieldCheck aria-hidden className="size-8 shrink-0 text-brand-600" /><div><h2 className="font-semibold">{t.home.trustTitle}</h2><p className="text-sm text-muted">{t.home.trustBody}</p></div></div>
        </Card>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8">
        <Card className="flex flex-col items-start justify-between gap-4 bg-ink text-white md:flex-row md:items-center">
          <div><h2 className="text-xl font-semibold">{t.home.teacherCta}</h2><p className="text-sm text-white/80">{t.home.teacherCtaBody}</p></div>
          <LinkButton href="/become-a-teacher" variant="secondary">{t.nav.becomeTeacher}</LinkButton>
        </Card>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="mb-4 text-2xl font-semibold">{t.home.faqTitle}</h2>
        {[[t.home.faq1q, t.home.faq1a], [t.home.faq2q, t.home.faq2a], [t.home.faq3q, t.home.faq3a]].map(([q, a]) => (
          <details key={q} className="mb-2 rounded-lg border border-line p-4"><summary className="cursor-pointer font-medium">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>
        ))}
      </section>
    </>
  );
}
