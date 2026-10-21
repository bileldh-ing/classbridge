import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { addLesson, lessonSchema } from "@/lib/services/courses";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_profile");
  const l = await addLesson(getDb(), u, (await params).id, await parseBody(req, lessonSchema));
  return json({ id: l.id }, 201);
});
