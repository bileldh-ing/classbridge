import type { DbOrTx } from "../db";
import { auditLog } from "../db/schema";

export async function audit(db: DbOrTx, e: {
  actorId: string | null; action: string; targetType: string; targetId?: string | null; reason?: string | null; metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({
    actorId: e.actorId, action: e.action, targetType: e.targetType, targetId: e.targetId ?? null,
    reason: e.reason ?? null, metadata: e.metadata ?? {},
  });
}
