import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { codeSchema, enableTotp } from "@/lib/services/mfa";

export const POST = route(async (req) => {
  const u = await requireUser();
  const { code } = await parseBody(req, codeSchema);
  await enableTotp(getDb(), u.id, u.sessionId, code);
  return json({ ok: true, redirect: "/admin" });
});
