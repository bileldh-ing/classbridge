import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { verifyEmail } from "@/lib/auth/core";
import { clientIp } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/services/rate-limit";

// POST (not GET) so link scanners/prefetchers cannot consume the single-use token.
export const POST = route(async (req) => {
  await enforceRateLimit(getDb(), `verify:${await clientIp()}`, 30, 3600);
  const { token } = await parseBody(req, z.object({ token: z.string().min(20).max(200) }));
  await verifyEmail(getDb(), token);
  return json({ ok: true });
});
