import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { listConversations } from "@/lib/services/messaging";
import { getI18n } from "@/lib/i18n/server";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default async function MessagesPage() {
  const user = await requireUserPage("/messages");
  const { t } = await getI18n();
  const rows = await listConversations(getDb(), user);
  return (
    <div>
      <PageHeader title={t.nav.messages} subtitle="Conversations open between a student and a teacher who share a booking." />
      {rows.length === 0 ? <EmptyState title={t.common.empty} body="Open a conversation from a lesson page." /> : (
        <Card><ul className="divide-y divide-line">{rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-3"><div><Link href={`/messages/${c.id}`} className="font-medium hover:underline">{c.other_name}</Link><p className="text-sm text-muted">{c.preview ?? "—"}</p></div>{c.unread > 0 && <Badge tone="brand">{c.unread}</Badge>}</li>
        ))}</ul></Card>
      )}
    </div>
  );
}
