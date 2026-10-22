/**
 * Staff two-factor (TOTP). Enrollment: setup → secret stored encrypted but NOT enabled → enable with a valid code.
 * Each successful verification marks the current session as MFA-verified; codes cannot be replayed (last step stored).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db";
import { sessions, users } from "../db/schema";
import { AppError } from "../errors";
import { env } from "../env";
import { decryptSecret, encryptSecret, generateTotpSecret, otpauthUri, verifyTotp } from "../auth/totp";
import { rateLimit } from "./rate-limit";
import { audit } from "./audit";

export const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "six_digits") });

export async function beginTotpSetup(db: DB, userId: string) {
  const [u] = await db.select({ email: users.email, enabled: users.totpEnabledAt }).from(users).where(eq(users.id, userId));
  if (u.enabled) throw new AppError("CONFLICT", "Two-factor authentication is already enabled.");
  const secret = generateTotpSecret();
  await db.update(users).set({ totpSecretEnc: encryptSecret(secret, env().AUTH_SECRET), totpLastStep: null }).where(eq(users.id, userId));
  return { secret, otpauthUri: otpauthUri(secret, u.email) };
}

async function check(db: DB, userId: string, code: string) {
  const rl = await rateLimit(db, `mfa:${userId}`, 10, 300);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many attempts. Wait a few minutes.");
  const [u] = await db.select({ enc: users.totpSecretEnc, last: users.totpLastStep, enabled: users.totpEnabledAt }).from(users).where(eq(users.id, userId));
  if (!u?.enc) throw new AppError("NOT_ELIGIBLE", "Start two-factor setup first.");
  const step = verifyTotp(decryptSecret(u.enc, env().AUTH_SECRET), code, Date.now(), u.last);
  if (step === null) throw new AppError("UNAUTHENTICATED", "That code is not valid. Check your device clock and try again.");
  await db.update(users).set({ totpLastStep: step }).where(eq(users.id, userId));
  return u;
}

export async function enableTotp(db: DB, userId: string, sessionId: string, code: string) {
  const u = await check(db, userId, code);
  if (u.enabled) throw new AppError("CONFLICT", "Already enabled.");
  await db.update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, userId));
  await db.update(sessions).set({ mfaVerifiedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  await audit(db, { actorId: userId, action: "mfa.enabled", targetType: "user", targetId: userId });
}

export async function verifySessionTotp(db: DB, userId: string, sessionId: string, code: string) {
  const u = await check(db, userId, code);
  if (!u.enabled) throw new AppError("NOT_ELIGIBLE", "Two-factor authentication is not enabled.");
  await db.update(sessions).set({ mfaVerifiedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  await audit(db, { actorId: userId, action: "mfa.session_verified", targetType: "user", targetId: userId });
}
