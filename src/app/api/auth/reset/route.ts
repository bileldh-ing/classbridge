import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { resetSchema } from "@/lib/validation/auth";
import { resetPassword } from "@/lib/auth/core";
import { clientIp } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/services/rate-limit";

export const POST = route(async (req) => {
  const db = getDb();
  await enforceRateLimit(db, `reset:${await clientIp()}`, 20, 3600);
  const { token, password } = await parseBody(req, resetSchema);
  await resetPassword(db, token, password);
  return json({ ok: true });
});
