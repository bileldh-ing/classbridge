import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { subjectSchema, upsertSubject } from "@/lib/services/moderation";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admin.manage_subjects");
  return json(await upsertSubject(getDb(), u, await parseBody(req, subjectSchema), (await params).id));
});
