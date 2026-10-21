import Link from "next/link";
import { getDb } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { listPublishedCourses } from "@/lib/services/courses";
import { listSubjects, subjectName } from "@/lib/services/catalog";
import { formatMoney } from "@/lib/money";
import { Badge, buttonClass, Card, DemoBadge, EmptyState, inputClass, PageHeader } from "@/components/ui";

export const metadata = { title: "Courses", alternates: { canonical: "/courses" } };
export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const db = getDb();
  const clean = (v?: string) => (v && v.length < 80 ? v : undefined);
  const [list, subs] = await Promise.all([
    listPublishedCourses(db, { q: clean(sp.q), subject: sp.subject && /^[a-z0-9-]+$/.test(sp.subject) ? sp.subject : undefined, level: clean(sp.level), language: clean(sp.language), free: sp.free === "1" }),
    listSubjects(db),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader title={t.nav.courses} />
      <form className="mb-6 grid gap-2 sm:grid-cols-6" method="get">
        <input name="q" defaultValue={sp.q} placeholder={t.common.search} aria-label={t.common.search} className={`${inputClass} sm:col-span-2`} />
        <select name="subject" defaultValue={sp.subject ?? ""} aria-label={t.search.subject} className={inputClass}><option value="">{t.search.anySubject}</option>{subs.map((s) => <option key={s.id} value={s.slug}>{subjectName(s, locale)}</option>)}</select>
        <select name="level" defaultValue={sp.level ?? ""} aria-label={t.search.level} className={inputClass}><option value="">{t.search.anyLevel}</option><option>beginner</option><option>intermediate</option><option>advanced</option></select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="free" value="1" defaultChecked={sp.free === "1"} />{t.common.free}</label>
        <button className={buttonClass("primary")}>{t.search.apply}</button>
      </form>
      {list.length === 0 ? <EmptyState title={t.common.empty} /> : (
        <div className="grid gap-4 md:grid-cols-3">{list.map((c) => (
          <Card key={c.id} className="flex flex-col">
            <div className="mb-1 flex flex-wrap gap-1">{c.is_demo && <DemoBadge label={t.common.demo} />}<Badge>{c.level}</Badge><Badge>{c.language}</Badge>{c.subject && <Badge tone="brand">{c.subject}</Badge>}</div>
            <h2 className="font-semibold"><Link className="hover:underline" href={`/courses/${c.slug}`}>{c.title}</Link></h2>
            <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted">{c.summary}</p>
            <p className="mt-2 text-sm">{c.teacher} · {c.lessons} lessons · {c.minutes} {t.common.minutes}</p>
            <p className="mt-1 font-semibold">{c.price_minor === 0 ? t.common.free : formatMoney(Number(c.price_minor), c.currency, locale)}</p>
          </Card>))}</div>
      )}
    </div>
  );
}
