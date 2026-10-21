import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission, requireUser } from "@/lib/auth/session";
import { becomeTeacher, getTeacherByUser, teacherProfileSchema, updateTeacherProfile, profileCompleteness } from "@/lib/services/teachers";
import { setActiveRole } from "@/lib/auth/core";
import { AppError } from "@/lib/errors";

/** Owner view of the teacher profile (includes private fields, completeness). */
export const GET = route(async () => {
  const u = await requirePermission("teach.manage_profile");
  const t = await getTeacherByUser(getDb(), u.id);
  if (!t) throw new AppError("NOT_FOUND", "No teacher profile");
  return json({ profile: t, completeness: await profileCompleteness(getDb(), t.id) });
});

/** Role upgrade: adds the teacher capability to the SAME identity and switches context. */
export const POST = route(async () => {
  const u = await requireUser();
  const t = await becomeTeacher(getDb(), u.id);
  await setActiveRole(getDb(), u.sessionId, "teacher", [...u.roles, "teacher"]);
  return json({ id: t.id, redirect: "/teach/profile" }, 201);
});

export const PUT = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  await updateTeacherProfile(getDb(), u.id, await parseBody(req, teacherProfileSchema));
  return json({ ok: true });
});
