import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { savedTeachers, teacherProfiles } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { searchTeachers } from "@/lib/services/teacher-search";
import { teacherSearchSchema } from "@/lib/validation/search";
import { TeacherCardView } from "@/components/teachers/teacher-card";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

export default async function SavedPage() {
  const user = await requireUserPage("/saved");
  const { t, locale } = await getI18n();
  const db = getDb();
  const ids = (await db.select({ id: savedTeachers.teacherId }).from(savedTeachers).innerJoin(teacherProfiles, eq(teacherProfiles.id, savedTeachers.teacherId)).where(eq(savedTeachers.userId, user.id))).map((r) => r.id);
  const all = ids.length ? (await searchTeachers(db, teacherSearchSchema.parse({ pageSize: "50" }), locale)).items.filter((c) => ids.includes(c.id)) : [];
  return (
    <div>
      <PageHeader title={t.nav.saved} />
      {all.length === 0 ? <EmptyState title={t.common.empty} action={<LinkButton href="/teachers">{t.nav.findTeachers}</LinkButton>} /> : <div className="space-y-3">{all.map((c) => <TeacherCardView key={c.id} c={c} t={t} locale={locale} viewerTz={user.timezone} />)}</div>}
    </div>
  );
}
