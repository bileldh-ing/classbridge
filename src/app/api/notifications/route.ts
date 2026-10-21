import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const GET = route(async () => {
  const u = await requireUser();
  const rows = await getDb().select().from(notifications).where(eq(notifications.userId, u.id)).orderBy(desc(notifications.createdAt)).limit(50);
  return json({ items: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: !!n.readAt, createdAt: n.createdAt.getTime() })) });
});
