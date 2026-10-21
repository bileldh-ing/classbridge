import { desc, eq, isNull, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teacherBadges, teacherCredentials } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { requireTeacher } from "@/lib/services/teachers";
import { getI18n } from "@/lib/i18n/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CredentialForm } from "@/components/forms/teacher-forms";

export default async function CredentialsPage() {
  const user = await requireUserPage("/teach/credentials");
  const { t } = await getI18n();
  const db = getDb();
  const tp = await requireTeacher(db, user.id);
  const creds = await db.select().from(teacherCredentials).where(eq(teacherCredentials.teacherId, tp.id)).orderBy(desc(teacherCredentials.createdAt));
  const badges = await db.select().from(teacherBadges).where(and(eq(teacherBadges.teacherId, tp.id), isNull(teacherBadges.revokedAt)));
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t.nav.credentials} subtitle="Uploaded files go to private storage and are visible only to you and authorised reviewers." />
      <Card><h2 className="mb-2 font-semibold">Badges</h2>{badges.length === 0 ? <p className="text-sm text-muted">No badges yet. Badges are granted only after an explicit administrator review.</p> : <div className="flex gap-2">{badges.map((b) => <Badge key={b.id} tone="success">{t.teacher.badges[b.badge]}</Badge>)}</div>}</Card>
      <Card><h2 className="mb-3 font-semibold">Add a credential</h2><CredentialForm /></Card>
      <Card><h2 className="mb-3 font-semibold">Submitted</h2>
        {creds.length === 0 ? <p className="text-sm text-muted">{t.common.empty}</p> : <ul className="space-y-2 text-sm">{creds.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2"><span>{c.title} — {c.issuer} {c.issuedYear ? `(${c.issuedYear})` : ""} {c.fileKey ? "· file attached" : ""}</span>
            <span className="flex items-center gap-2"><Badge tone={c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : "warn"}>{c.status}</Badge>{c.reviewNote && <span className="text-muted">{c.reviewNote}</span>}</span></li>))}</ul>}
      </Card>
    </div>
  );
}
