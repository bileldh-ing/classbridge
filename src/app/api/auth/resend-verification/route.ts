import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { issueEmailVerification } from "@/lib/auth/core";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/services/rate-limit";
import { deliverPendingEmails } from "@/lib/email/outbox";
import { AppError } from "@/lib/errors";

export const POST = route(async () => {
  const u = await requireUser();
  if (u.emailVerified) throw new AppError("CONFLICT", "Email already verified.");
  const db = getDb();
  await enforceRateLimit(db, `resend:${u.id}`, 3, 3600);
  await issueEmailVerification(db, u.id, u.email);
  void deliverPendingEmails(db).catch(() => {});
  return json({ ok: true });
});
