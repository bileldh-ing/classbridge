import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** Signs out every other session of the current user (current device stays signed in). */
export const POST = route(async () => {
  const u = await requireUser();
  await getDb().update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, u.id), isNull(sessions.revokedAt), ne(sessions.id, u.sessionId)));
  return json({ ok: true });
});
