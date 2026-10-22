import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { categorySchema, listTaxonomy, upsertCategory } from "@/lib/services/moderation";

export const GET = route(async () => {
  await requirePermission("admin.manage_subjects");
  return json({ items: await listTaxonomy(getDb()) });
});
export const POST = route(async (req) => {
  const u = await requirePermission("admin.manage_subjects");
  return json(await upsertCategory(getDb(), u, await parseBody(req, categorySchema)), 201);
});
