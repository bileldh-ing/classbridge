import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { completeLesson, completeSchema } from "@/lib/services/bookings";

/** Teacher records attendance (+ optional notes) after the lesson started. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_bookings");
  return json(await completeLesson(getDb(), u, (await params).id, await parseBody(req, completeSchema)));
});
