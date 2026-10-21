import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { clientIp, currentUser } from "@/lib/auth/session";
import { createReport, reportSchema } from "@/lib/services/reviews";
import { enforceRateLimit } from "@/lib/services/rate-limit";

export const POST = route(async (req) => {
  const u = await currentUser();
  await enforceRateLimit(getDb(), `report:${u?.id ?? await clientIp()}`, 10, 3600);
  return json(await createReport(getDb(), u, await parseBody(req, reportSchema)), 201);
});
