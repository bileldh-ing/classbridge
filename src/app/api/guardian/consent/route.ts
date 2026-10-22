import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { consentSchema, respondToGuardianLink } from "@/lib/services/guardians";

export const POST = route(async (req) => {
  const u = await requireUser();
  return json(await respondToGuardianLink(getDb(), u, await parseBody(req, consentSchema)));
});
