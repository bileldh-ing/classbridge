import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getMessages, messageSchema, sendMessage } from "@/lib/services/messaging";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const after = new URL(req.url).searchParams.get("after");
  const rows = await getMessages(getDb(), u, (await params).id, after ? new Date(Number(after)) : undefined);
  return json({ items: rows.map((m) => ({ id: m.id, body: m.body, mine: m.senderId === u.id, senderName: m.senderName, createdAt: m.createdAt.getTime() })) });
});
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const { body } = await parseBody(req, messageSchema);
  const m = await sendMessage(getDb(), u, (await params).id, body);
  return json({ id: m.id, createdAt: m.createdAt.getTime() }, 201);
});
