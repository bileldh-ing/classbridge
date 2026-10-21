import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { decideReport, reportDecisionSchema } from "@/lib/services/admin";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admin.manage_reports");
  await decideReport(getDb(), u, (await params).id, await parseBody(req, reportDecisionSchema));
  return json({ ok: true });
});
