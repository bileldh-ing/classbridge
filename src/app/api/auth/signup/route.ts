import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { signupSchema } from "@/lib/validation/auth";
import { createSession, signup } from "@/lib/auth/core";
import { clientIp, setSessionCookie } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/services/rate-limit";
import { deliverPendingEmails } from "@/lib/email/outbox";

export const POST = route(async (req) => {
  const db = getDb();
  await enforceRateLimit(db, `signup:${await clientIp()}`, 10, 3600);
  const input = await parseBody(req, signupSchema);
  const { userId } = await signup(db, input);
  const s = await createSession(db, userId, "student", (await headers()).get("user-agent"));
  await setSessionCookie(s.token, s.expiresAt);
  void deliverPendingEmails(db).catch(() => {}); // best effort; the job runner retries
  return json({ ok: true, redirect: "/dashboard" }, 201);
});
