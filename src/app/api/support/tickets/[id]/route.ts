import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getTicket } from "@/lib/services/support";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return json(await getTicket(getDb(), u, (await params).id));
});
