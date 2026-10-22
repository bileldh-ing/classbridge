import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { needsMfa, requireUser } from "@/lib/auth/session";
import { replySchema, replyToTicket } from "@/lib/services/support";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/auth/permissions";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const input = await parseBody(req, replySchema);
  if (can(u, "support.manage_tickets") && needsMfa(u, "support.manage_tickets")) {
    // Staff acting on other people's tickets need a verified session (their own tickets don't).
    const { getTicket } = await import("@/lib/services/support");
    const t = await getTicket(getDb(), u, (await params).id);
    if (t.ticket.userId !== u.id) throw new AppError("MFA_REQUIRED", "Two-factor verification required.");
  }
  const m = await replyToTicket(getDb(), u, (await params).id, input);
  return json({ id: m.id }, 201);
});
