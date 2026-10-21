import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/time";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";

export default async function NotificationsPage() {
  const user = await requireUserPage("/notifications");
  const { t, locale } = await getI18n();
  const rows = await getDb().select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(100);
  return (
    <div>
      <PageHeader title={t.nav.notifications} actions={rows.some((r) => !r.readAt) ? <ActionButton endpoint="/api/notifications/read" label="Mark all as read" variant="secondary" /> : null} />
      {rows.length === 0 ? <EmptyState title={t.common.empty} /> : (
        <Card><ul className="divide-y divide-line">{rows.map((n) => (
          <li key={n.id} className={`py-3 text-sm ${n.readAt ? "" : "font-medium"}`}>
            {!n.readAt && <span className="me-2 inline-block size-2 rounded-full bg-brand-600" aria-label="unread" />}
            {n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}
            <p className="font-normal text-muted">{n.body}</p><p className="text-xs font-normal text-muted">{fmtDateTime(n.createdAt, user.timezone, locale)}</p>
          </li>))}</ul></Card>
      )}
    </div>
  );
}
