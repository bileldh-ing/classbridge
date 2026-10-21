import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { locationSchema, setTeacherLocation } from "@/lib/services/teachers";
export const PUT = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  await setTeacherLocation(getDb(), u.id, await parseBody(req, locationSchema));
  return json({ ok: true });
});
