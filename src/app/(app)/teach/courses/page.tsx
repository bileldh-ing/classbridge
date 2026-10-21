import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { teacherCourses } from "@/lib/services/courses";
import { listSubjects, subjectName } from "@/lib/services/catalog";
import { getI18n } from "@/lib/i18n/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CourseForm } from "@/components/courses/client";

export default async function TeacherCourses() {
  const user = await requireUserPage("/teach/courses");
  const { t, locale } = await getI18n();
  const db = getDb();
  const [rows, subs] = await Promise.all([teacherCourses(db, user), listSubjects(db)]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t.nav.teacherCourses} />
      {rows.length > 0 && <Card><ul className="divide-y divide-line">{rows.map((r) => <li key={r.c.id} className="flex items-center justify-between py-2"><Link className="font-medium hover:underline" href={`/teach/courses/${r.c.id}`}>{r.c.title}</Link><span className="flex gap-2"><Badge>{r.c.status}</Badge><Badge tone="brand">{r.learners} learners</Badge></span></li>)}</ul></Card>}
      <Card><h2 className="mb-3 font-semibold">New course</h2><CourseForm subjects={subs.map((s) => ({ id: s.id, name: subjectName(s, locale) }))} /></Card>
    </div>
  );
}
