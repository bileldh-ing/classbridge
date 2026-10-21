import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const POST = route(async () => {
  const u = await requireUser();
  await getDb().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, u.id), isNull(notifications.readAt)));
  return json({ ok: true });
});
