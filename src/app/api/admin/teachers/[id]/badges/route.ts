import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { badgeSchema, setBadge } from "@/lib/services/admin";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admin.verify_teachers");
  await setBadge(getDb(), u, (await params).id, await parseBody(req, badgeSchema));
  return json({ ok: true });
});
