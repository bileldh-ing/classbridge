import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listConversations, openConversationForBooking } from "@/lib/services/messaging";

export const GET = route(async () => {
  const u = await requireUser();
  const rows = await listConversations(getDb(), u);
  return json({ items: rows.map((r) => ({ id: r.id, otherName: r.other_name, unread: r.unread, preview: r.preview })) });
});
/** Opens (or returns) the conversation for a booking the caller participates in. */
export const POST = route(async (req) => {
  const u = await requireUser();
  const { bookingId } = await parseBody(req, z.object({ bookingId: z.string().uuid() }));
  const c = await openConversationForBooking(getDb(), u, bookingId);
  return json({ id: c.id });
});
