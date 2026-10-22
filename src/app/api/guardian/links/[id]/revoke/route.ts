import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { revokeGuardianLink } from "@/lib/services/guardians";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return json(await revokeGuardianLink(getDb(), u, (await params).id));
});
