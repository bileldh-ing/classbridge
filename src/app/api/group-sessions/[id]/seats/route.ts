import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { bookGroupSeat, seatSchema } from "@/lib/services/group-lessons";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("learn.book");
  const input = await parseBody(req, seatSchema);
  const b = await bookGroupSeat(getDb(), u, (await params).id, input);
  return json({ id: b.id, status: b.status, holdExpiresAt: b.holdExpiresAt, redirect: `/lessons/${b.id}/checkout` }, 201);
});
