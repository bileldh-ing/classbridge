import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { subjects } from "@/lib/db/schema";
import { getI18n } from "@/lib/i18n/server";
import { subjectName } from "@/lib/services/catalog";
import { searchTeachers } from "@/lib/services/teacher-search";
import { teacherSearchSchema } from "@/lib/validation/search";
import { TeacherCardView } from "@/components/teachers/teacher-card";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [s] = await getDb().select().from(subjects).where(eq(subjects.slug, slug));
  return s ? { title: `${s.nameEn} teachers`, alternates: { canonical: `/subjects/${slug}` } } : { title: "Subject not found" };
}
export default async function SubjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) notFound();
  const { t, locale } = await getI18n();
  const db = getDb();
  const [s] = await db.select().from(subjects).where(eq(subjects.slug, slug));
  if (!s) notFound();
  const r = await searchTeachers(db, teacherSearchSchema.parse({ subject: slug, pageSize: "12" }), locale);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title={subjectName(s, locale)} subtitle={`${r.total} · ${t.nav.findTeachers}`} actions={<LinkButton href={`/teachers?subject=${slug}`}>{t.search.apply}</LinkButton>} />
      {r.items.length === 0 ? <EmptyState title={t.search.noResults} /> : <div className="space-y-3">{r.items.map((c) => <TeacherCardView key={c.id} c={c} t={t} locale={locale} viewerTz="UTC" />)}</div>}
    </div>
  );
}
