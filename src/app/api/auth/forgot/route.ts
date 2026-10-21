import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { forgotSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/auth/core";
import { clientIp } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/services/rate-limit";
import { deliverPendingEmails } from "@/lib/email/outbox";

export const POST = route(async (req) => {
  const db = getDb();
  const { email } = await parseBody(req, forgotSchema);
  await enforceRateLimit(db, `forgot:${await clientIp()}`, 10, 3600);
  await enforceRateLimit(db, `forgot:${email}`, 3, 3600);
  await requestPasswordReset(db, email);
  void deliverPendingEmails(db).catch(() => {});
  return json({ ok: true }); // identical response whether or not the account exists
});
