import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { beginTotpSetup } from "@/lib/services/mfa";

/** Starts TOTP enrollment for staff accounts; returns the secret ONCE so it can be added to an authenticator app. */
export const POST = route(async () => {
  const u = await requireUser();
  if (!isStaff(u)) throw new AppError("FORBIDDEN", "Two-factor enrollment is currently offered to staff accounts.");
  return json(await beginTotpSetup(getDb(), u.id));
});
