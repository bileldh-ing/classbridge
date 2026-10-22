import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courses, profiles, teacherProfiles } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DecisionForm } from "@/components/forms/admin-forms";
import { allowed, Denied } from "../guard";

export default async function AdminModeration() {
  const user = await requireUserPage("/admin/moderation");
  if (!allowed(user, "admin.moderate_content")) Denied();
  const db = getDb();
  const cs = await db.select({ c: courses, teacher: profiles.displayName }).from(courses).innerJoin(teacherProfiles, eq(teacherProfiles.id, courses.teacherId))
    .innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId)).where(inArray(courses.status, ["published", "archived"])).orderBy(desc(courses.updatedAt)).limit(100);
  const ts = await db.select({ t: teacherProfiles, name: profiles.displayName }).from(teacherProfiles).innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId))
    .where(inArray(teacherProfiles.publishState, ["published", "suspended"])).orderBy(desc(teacherProfiles.updatedAt)).limit(100);
  return (
    <div className="space-y-6">
      <PageHeader title="Content moderation" subtitle="Unpublish courses or suspend public profiles for policy reasons. The owner is notified and the action is audited." />
      <section className="space-y-2"><h2 className="font-semibold">Courses</h2>{cs.map(({ c, teacher }) => (
        <Card key={c.id} data-testid={`course-${c.slug}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2"><span className="font-medium">{c.title}</span><span className="text-sm text-muted">by {teacher}</span><Badge>{c.status}</Badge>{c.moderationNote && <span className="text-xs text-muted">Note: {c.moderationNote}</span>}</div>
          <DecisionForm endpoint={`/api/admin/courses/${c.id}/moderate`} options={c.status === "published" ? [{ value: "unpublish", label: "Unpublish", field: "action", variant: "danger" }] : [{ value: "restore", label: "Restore to draft", field: "action" }]} />
        </Card>))}</section>
      <section className="space-y-2"><h2 className="font-semibold">Teacher profiles</h2>{ts.map(({ t, name }) => (
        <Card key={t.id}>
          <div className="mb-2 flex items-center gap-2"><span className="font-medium">{name}</span><Badge>{t.publishState}</Badge></div>
          <DecisionForm endpoint={`/api/admin/teachers/${t.id}/moderate`} options={t.publishState === "published" ? [{ value: "suspend", label: "Suspend profile", field: "action", variant: "danger" }] : [{ value: "reinstate", label: "Reinstate", field: "action" }]} />
        </Card>))}</section>
    </div>
  );
}
