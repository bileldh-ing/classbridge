import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { categorySchema, upsertCategory } from "@/lib/services/moderation";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admin.manage_subjects");
  return json(await upsertCategory(getDb(), u, await parseBody(req, categorySchema), (await params).id));
});
