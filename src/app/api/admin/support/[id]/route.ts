import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { ticketUpdateSchema, updateTicket } from "@/lib/services/support";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("support.manage_tickets");
  await updateTicket(getDb(), u, (await params).id, await parseBody(req, ticketUpdateSchema));
  return json({ ok: true });
});
