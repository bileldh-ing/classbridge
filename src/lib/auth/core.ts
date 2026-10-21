/**
 * Authentication core (framework-agnostic, DB-backed).
 * - Passwords: argon2id. Sessions: random 256-bit token in an httpOnly cookie; only sha256(token) is stored.
 * - Email verification / password reset: single-use hashed tokens with expiry.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { DB, DbOrTx } from "../db";
import { authTokens, consentRecords, profiles, sessions, userRoles, users } from "../db/schema";
import { AppError, pgCode, PG_UNIQUE_VIOLATION } from "../errors";
import { randomToken, sha256 } from "../crypto";
import { dummyVerify, hashPassword, verifyPassword } from "./password";
import type { Role } from "./permissions";
import { POLICY_VERSIONS, type SignupInput } from "../validation/auth";
import { enqueueEmail } from "../email/outbox";
import { env } from "../env";
import { isValidTimezone } from "../scheduling/slots";

export const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string; email: string; emailVerified: boolean; status: string; roles: Role[];
  activeRole: Role; displayName: string; locale: string; timezone: string; sessionId: string;
};

export async function signup(db: DB, input: SignupInput, source = "web") {
  const tz = isValidTimezone(input.timezone) ? input.timezone : "UTC";
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({ email: input.email, passwordHash }).returning({ id: users.id });
      await tx.insert(profiles).values({ userId: u.id, displayName: input.displayName, timezone: tz, locale: input.locale, isAdultConfirmed: true });
      await tx.insert(userRoles).values({ userId: u.id, role: "student" });
      await tx.insert(consentRecords).values([
        { userId: u.id, consentType: "terms", policyVersion: POLICY_VERSIONS.terms, value: true, source },
        { userId: u.id, consentType: "privacy", policyVersion: POLICY_VERSIONS.privacy, value: true, source },
        { userId: u.id, consentType: "marketing", policyVersion: POLICY_VERSIONS.privacy, value: input.marketingOptIn, source },
      ]);
      await issueEmailVerification(tx, u.id, input.email);
      return { userId: u.id };
    });
  } catch (e) {
    if (pgCode(e) === PG_UNIQUE_VIOLATION) throw new AppError("CONFLICT", "An account with this email already exists.");
    throw e;
  }
}

export async function issueEmailVerification(db: DbOrTx, userId: string, email: string) {
  const token = randomToken();
  await db.insert(authTokens).values({ userId, purpose: "verify_email", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 48 * 3600_000) });
  const link = `${env().APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await enqueueEmail(db, {
    to: email, userId, template: "verify_email", subject: "Verify your ClassBridge email",
    body: `Welcome to ClassBridge. Confirm your email address by opening this link (valid 48 hours):\n\n${link}\n\nIf you did not create an account you can ignore this message.`,
    idempotencyKey: `verify_email:${sha256(token)}`,
  });
}

export async function consumeToken(db: DbOrTx, token: string, purpose: "verify_email" | "reset_password") {
  const [row] = await db.update(authTokens).set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning({ userId: authTokens.userId });
  if (!row) throw new AppError("NOT_ELIGIBLE", "This link is invalid or has expired.");
  return row.userId;
}

export async function verifyEmail(db: DB, token: string) {
  return db.transaction(async (tx) => {
    const userId = await consumeToken(tx, token, "verify_email");
    await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    return userId;
  });
}

export async function login(db: DB, email: string, password: string, userAgent?: string | null) {
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
  if (!u) {
    await dummyVerify(password);
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");
  }
  if (!(await verifyPassword(u.passwordHash, password))) throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");
  if (u.status !== "active") throw new AppError("FORBIDDEN", "This account is not active. Contact support.");
  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(and(eq(userRoles.userId, u.id), eq(userRoles.status, "active")))).map((r) => r.role);
  const activeRole: Role = roles.includes("student") ? "student" : roles[0] ?? "student";
  return createSession(db, u.id, activeRole, userAgent);
}

export async function createSession(db: DbOrTx, userId: string, activeRole: Role = "student", userAgent?: string | null) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, activeRole, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  return { token, expiresAt };
}

export async function getSessionUser(db: DB, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const sid = sha256(token);
  const rows = await db.execute<{
    id: string; email: string; email_verified_at: Date | null; status: string; active_role: Role; display_name: string;
    locale: string; timezone: string; last_seen_at: Date; roles: Role[] | null;
  }>(sql`
    SELECT u.id, u.email, u.email_verified_at, u.status, s.active_role, s.last_seen_at, p.display_name, p.locale, p.timezone,
      (SELECT array_agg(r.role::text) FROM user_roles r WHERE r.user_id = u.id AND r.status = 'active') AS roles
    FROM sessions s JOIN users u ON u.id = s.user_id JOIN profiles p ON p.user_id = u.id
    WHERE s.id = ${sid} AND s.revoked_at IS NULL AND s.expires_at > now()`);
  const r = rows.rows[0];
  if (!r || r.status !== "active") return null;
  if (Date.now() - new Date(r.last_seen_at).getTime() > 86_400_000) {
    await db.update(sessions).set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000) }).where(eq(sessions.id, sid));
  }
  const roles = (r.roles ?? []) as Role[];
  const active = roles.includes(r.active_role) ? r.active_role : roles[0] ?? "student";
  return {
    id: r.id, email: r.email, emailVerified: !!r.email_verified_at, status: r.status, roles, activeRole: active,
    displayName: r.display_name, locale: r.locale, timezone: r.timezone, sessionId: sid,
  };
}

export async function revokeSession(db: DbOrTx, token: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sha256(token)));
}

export async function revokeAllSessions(db: DbOrTx, userId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function setActiveRole(db: DbOrTx, sessionId: string, role: Role, roles: Role[]) {
  const target: Role = role === "admin" && !roles.includes("admin") && roles.includes("support") ? "support" : role;
  if (!roles.includes(target)) throw new AppError("FORBIDDEN", "You do not have this role.");
  await db.update(sessions).set({ activeRole: target }).where(eq(sessions.id, sessionId));
}

export async function requestPasswordReset(db: DB, email: string) {
  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
  if (!u) return; // do not reveal whether the account exists
  const token = randomToken();
  await db.transaction(async (tx) => {
    await tx.insert(authTokens).values({ userId: u.id, purpose: "reset_password", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) });
    await enqueueEmail(tx, {
      to: u.email, userId: u.id, template: "reset_password", subject: "Reset your ClassBridge password",
      body: `A password reset was requested for your account. Open this link within 1 hour to choose a new password:\n\n${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}\n\nIf you did not request this, ignore this email.`,
      idempotencyKey: `reset:${sha256(token)}`,
    });
  });
}

export async function resetPassword(db: DB, token: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    const userId = await consumeToken(tx, token, "reset_password");
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    await revokeAllSessions(tx, userId); // sign out everywhere after a reset
  });
}

export async function changePassword(db: DB, userId: string, current: string, next: string, keepSessionId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(u.passwordHash, current))) throw new AppError("UNAUTHENTICATED", "Current password is incorrect.");
  const passwordHash = await hashPassword(next);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), sql`${sessions.id} <> ${keepSessionId}`));
  });
}
