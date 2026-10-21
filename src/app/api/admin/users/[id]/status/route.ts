import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { setUserStatus, userStatusSchema } from "@/lib/services/admin";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admin.manage_users");
  await setUserStatus(getDb(), u, (await params).id, await parseBody(req, userStatusSchema));
  return json({ ok: true });
});
