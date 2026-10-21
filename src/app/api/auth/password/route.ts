import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { changePassword } from "@/lib/auth/core";
import { requireUser } from "@/lib/auth/session";
import { passwordSchema } from "@/lib/validation/auth";
import { enforceRateLimit } from "@/lib/services/rate-limit";

export const POST = route(async (req) => {
  const u = await requireUser();
  await enforceRateLimit(getDb(), `pwchange:${u.id}`, 5, 3600);
  const { current, next } = await parseBody(req, z.object({ current: z.string().min(1).max(128), next: passwordSchema }));
  await changePassword(getDb(), u.id, current, next, u.sessionId);
  return json({ ok: true });
});
