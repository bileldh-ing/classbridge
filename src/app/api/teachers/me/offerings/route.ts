import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { offeringSchema, upsertOffering } from "@/lib/services/teachers";
export const POST = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  const o = await upsertOffering(getDb(), u.id, await parseBody(req, offeringSchema));
  return json({ id: o.id }, 201);
});
