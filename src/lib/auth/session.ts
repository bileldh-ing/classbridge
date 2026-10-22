/** Next.js binding for the auth core: cookies, per-request caching and guards. */
import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { getSessionUser, type SessionUser } from "./core";
import { can, type Permission, type Role } from "./permissions";
import { AppError } from "../errors";
import { adminMfaRequired, env } from "../env";

export const SESSION_COOKIE = "cb_session";

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return getSessionUser(getDb(), jar.get(SESSION_COOKIE)?.value);
});

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt,
    secure: env().APP_URL.startsWith("https://"),
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Page guard: redirects to sign-in. */
export async function requireUserPage(nextPath?: string): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect(`/signin${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return u;
}

/** API guard: throws AppError (rendered into the error envelope). */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Sign in required.");
  return u;
}

/** Staff permissions require a TOTP-verified session when ADMIN_MFA_REQUIRED (default in production). */
export function needsMfa(u: SessionUser, p: Permission) {
  return (p.startsWith("admin.") || p.startsWith("support.")) && adminMfaRequired() && !u.mfaVerified;
}

export async function requirePermission(p: Permission): Promise<SessionUser> {
  const u = await requireUser();
  if (!can(u, p)) throw new AppError("FORBIDDEN", "You do not have permission to do this.");
  if (needsMfa(u, p)) throw new AppError("MFA_REQUIRED", u.mfaEnabled ? "Enter your authenticator code to continue." : "Set up two-factor authentication to use staff tools.");
  return u;
}

export function hasAnyRole(u: SessionUser | null, roles: Role[]) {
  return !!u && u.roles.some((r) => roles.includes(r));
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}
