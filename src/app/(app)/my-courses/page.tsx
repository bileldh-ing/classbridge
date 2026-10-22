import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { myCourses } from "@/lib/services/courses";
import { listBookmarks } from "@/lib/services/lms-extra";
import { getI18n } from "@/lib/i18n/server";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export default async function MyCourses() {
  const user = await requireUserPage("/my-courses");
  const { t } = await getI18n();
  const rows = await myCourses(getDb(), user.id);
  const bookmarks = await listBookmarks(getDb(), user);
  return (
    <div>
      <PageHeader title={t.nav.myCourses} />
      {rows.length === 0 ? <EmptyState title={t.common.empty} action={<LinkButton href="/courses">{t.nav.courses}</LinkButton>} /> : (
        <div className="grid gap-3 md:grid-cols-2">{rows.map((r) => (
          <Card key={r.e.id}><h2 className="font-semibold"><Link className="hover:underline" href={`/courses/${r.c.slug}`}>{r.c.title}</Link></h2>
            <div className="mt-2 h-2 rounded bg-line"><div className="h-2 rounded bg-brand-600" style={{ width: `${r.progress}%` }} /></div>
            <p className="mt-1 text-xs text-muted">{r.progress}%{r.e.completedAt ? " · completed" : ""}</p>
            <Link className="mt-2 inline-block text-sm underline" href={`/my-courses/${r.c.id}/assignments`}>Assignments & announcements</Link></Card>))}</div>
      )}
      {bookmarks.length > 0 && <section className="mt-6"><h2 className="mb-2 font-semibold">Bookmarked lessons</h2><Card><ul className="text-sm">{bookmarks.map((b) => <li key={b.lessonId}><Link className="underline" href={`/learn/${b.lessonId}`}>{b.lessonTitle}</Link> <span className="text-muted">— {b.courseTitle}</span></li>)}</ul></Card></section>}
    </div>
  );
}
