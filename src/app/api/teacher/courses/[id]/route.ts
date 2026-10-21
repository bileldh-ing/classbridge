import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { courseSchema, updateCourse } from "@/lib/services/courses";
export const PUT = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_profile");
  await updateCourse(getDb(), u, (await params).id, await parseBody(req, courseSchema));
  return json({ ok: true });
});
