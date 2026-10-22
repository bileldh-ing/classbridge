import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getNote, noteSchema, saveNote } from "@/lib/services/lms-extra";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return json({ note: await getNote(getDb(), u, (await params).id) });
});
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const n = await saveNote(getDb(), u, (await params).id, await parseBody(req, noteSchema));
  return json({ id: n.id, updatedAt: n.updatedAt });
});
