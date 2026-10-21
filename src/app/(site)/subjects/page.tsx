import Link from "next/link";
import { getDb } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { listSubjects, subjectName } from "@/lib/services/catalog";
import { Card, PageHeader } from "@/components/ui";
export const metadata = { title: "Subjects", alternates: { canonical: "/subjects" } };
export default async function Subjects() {
  const { t, locale } = await getI18n();
  const subs = await listSubjects(getDb());
  const groups = new Map<string, typeof subs>();
  for (const s of subs) { const k = locale === "fr" ? s.categoryFr : locale === "ar" ? s.categoryAr : s.categoryEn; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader title={t.nav.subjects} />
      <div className="grid gap-4 md:grid-cols-3">{[...groups.entries()].map(([cat, list]) => (
        <Card key={cat}><h2 className="mb-2 font-semibold">{cat}</h2><ul className="space-y-1">{list.map((s) => <li key={s.id}><Link className="text-brand-700 hover:underline" href={`/subjects/${s.slug}`}>{subjectName(s, locale)}</Link></li>)}</ul></Card>
      ))}</div>
    </div>
  );
}
