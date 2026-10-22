import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { moderateTeacher, teacherModerationSchema } from "@/lib/services/moderation";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admin.moderate_content");
  return json(await moderateTeacher(getDb(), u, (await params).id, await parseBody(req, teacherModerationSchema)));
});
