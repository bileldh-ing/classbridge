import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { flagUpdateSchema, setFlag } from "@/lib/services/flags";

export const POST = route<{ key: string }>(async (req, { params }) => {
  const u = await requirePermission("admin.manage_flags");
  return json(await setFlag(getDb(), u, (await params).key, await parseBody(req, flagUpdateSchema)));
});
