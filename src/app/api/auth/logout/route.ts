import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { revokeSession } from "@/lib/auth/core";
import { clearSessionCookie, getSessionToken } from "@/lib/auth/session";

export const POST = route(async () => {
  const token = await getSessionToken();
  if (token) await revokeSession(getDb(), token);
  await clearSessionCookie();
  return json({ ok: true });
});
