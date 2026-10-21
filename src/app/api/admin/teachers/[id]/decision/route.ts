import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { decideTeacherProfile, teacherDecisionSchema } from "@/lib/services/admin";
import { deliverPendingEmails } from "@/lib/email/outbox";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admin.verify_teachers");
  await decideTeacherProfile(getDb(), u, (await params).id, await parseBody(req, teacherDecisionSchema));
  void deliverPendingEmails(getDb()).catch(() => {});
  return json({ ok: true });
});
