import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { addLessonNote, noteSchema } from "@/lib/services/bookings";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_bookings");
  await addLessonNote(getDb(), u, (await params).id, await parseBody(req, noteSchema));
  return json({ ok: true }, 201);
});
