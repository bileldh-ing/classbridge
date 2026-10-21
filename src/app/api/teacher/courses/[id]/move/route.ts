import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { moveLesson } from "@/lib/services/courses";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_profile");
  const { lessonId, dir } = await parseBody(req, z.object({ lessonId: z.string().uuid(), dir: z.enum(["up", "down"]) }));
  await moveLesson(getDb(), u, (await params).id, lessonId, dir);
  return json({ ok: true });
});
