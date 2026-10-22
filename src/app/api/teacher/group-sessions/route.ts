import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { createGroupSession, groupSessionSchema, listGroupSessions } from "@/lib/services/group-lessons";
import { requireTeacher } from "@/lib/services/teachers";

export const GET = route(async () => {
  const u = await requirePermission("teach.manage_profile");
  const t = await requireTeacher(getDb(), u.id);
  return json({ items: await listGroupSessions(getDb(), t.id) });
});
export const POST = route(async (req) => {
  const u = await requirePermission("teach.manage_bookings");
  const input = await parseBody(req, groupSessionSchema);
  return json(await createGroupSession(getDb(), u, input), 201);
});
