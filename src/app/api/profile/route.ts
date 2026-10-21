import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isValidTimezone } from "@/lib/scheduling/slots";

export const PUT = route(async (req) => {
  const u = await requireUser();
  const v = await parseBody(req, z.object({ displayName: z.string().trim().min(2).max(80), timezone: z.string().refine(isValidTimezone, "invalid_timezone"), learningGoals: z.string().max(1000).optional() }));
  await getDb().update(profiles).set({ ...v, updatedAt: new Date() }).where(eq(profiles.userId, u.id));
  return json({ ok: true });
});
