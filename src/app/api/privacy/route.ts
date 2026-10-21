import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { privacyRequests, users } from "@/lib/db/schema";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/services/audit";

/** Data-export / account-deletion requests are recorded for staff processing (financial records have separate retention). */
export const POST = route(async (req) => {
  const u = await requireUser();
  const { kind } = await parseBody(req, z.object({ kind: z.enum(["export", "deletion"]) }));
  const db = getDb();
  const open = await db.select().from(privacyRequests).where(and(eq(privacyRequests.userId, u.id), eq(privacyRequests.kind, kind), eq(privacyRequests.status, "open")));
  if (!open.length) {
    await db.insert(privacyRequests).values({ userId: u.id, kind });
    if (kind === "deletion") await db.update(users).set({ status: "deletion_requested" }).where(eq(users.id, u.id));
    await audit(db, { actorId: u.id, action: `privacy.${kind}_requested`, targetType: "user", targetId: u.id });
  }
  return json({ ok: true });
});
