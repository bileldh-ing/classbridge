/** Feature flags (DB-backed, audited changes). Unknown keys are treated as OFF. */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB, DbOrTx } from "../db";
import { featureFlags } from "../db/schema";
import { AppError } from "../errors";
import { can, type Principal } from "../auth/permissions";
import { audit } from "./audit";

export type FlagKey = "ai_features" | "group_lessons" | "guardian_links" | "minor_accounts" | "realtime_messaging";

export async function isEnabled(db: DbOrTx, key: FlagKey): Promise<boolean> {
  const [f] = await db.select({ enabled: featureFlags.enabled }).from(featureFlags).where(eq(featureFlags.key, key));
  return !!f?.enabled;
}

export async function requireFlag(db: DbOrTx, key: FlagKey, what: string) {
  if (!(await isEnabled(db, key))) throw new AppError("NOT_ELIGIBLE", `${what} is not enabled on this ClassBridge deployment.`);
}

export async function listFlags(db: DbOrTx) {
  return db.select().from(featureFlags).orderBy(asc(featureFlags.key));
}

export const flagUpdateSchema = z.object({ enabled: z.boolean(), reason: z.string().trim().min(5).max(500) });

export async function setFlag(db: DB, actor: Principal, key: string, input: z.infer<typeof flagUpdateSchema>) {
  if (!can(actor, "admin.manage_flags")) throw new AppError("FORBIDDEN", "You do not have permission to do this.");
  return db.transaction(async (tx) => {
    const [f] = await tx.update(featureFlags).set({ enabled: input.enabled, updatedBy: actor.id, updatedAt: new Date() }).where(eq(featureFlags.key, key)).returning();
    if (!f) throw new AppError("NOT_FOUND", "Unknown feature flag.");
    await audit(tx, { actorId: actor.id, action: `flag.${input.enabled ? "enabled" : "disabled"}`, targetType: "feature_flag", targetId: key, reason: input.reason });
    return f;
  });
}
