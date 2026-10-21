import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { courseSchema, createCourse } from "@/lib/services/courses";
export const POST = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  const c = await createCourse(getDb(), u, await parseBody(req, courseSchema));
  return json({ id: c.id, redirect: `/teach/courses/${c.id}` }, 201);
});
