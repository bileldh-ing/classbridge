import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createTicket, listMyTickets, ticketSchema } from "@/lib/services/support";

export const GET = route(async () => {
  const u = await requireUser();
  return json({ items: await listMyTickets(getDb(), u) });
});
export const POST = route(async (req) => {
  const u = await requireUser();
  const t = await createTicket(getDb(), u, await parseBody(req, ticketSchema));
  return json({ id: t.id, redirect: `/support/${t.id}` }, 201);
});
