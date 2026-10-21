import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { loginSchema } from "@/lib/validation/auth";
import { login } from "@/lib/auth/core";
import { clientIp, setSessionCookie } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/services/rate-limit";

export const POST = route(async (req) => {
  const db = getDb();
  const input = await parseBody(req, loginSchema);
  await enforceRateLimit(db, `login:ip:${await clientIp()}`, 30, 900);
  await enforceRateLimit(db, `login:email:${input.email}`, 10, 900);
  const s = await login(db, input.email, input.password, (await headers()).get("user-agent"));
  await setSessionCookie(s.token, s.expiresAt);
  return json({ ok: true });
});
