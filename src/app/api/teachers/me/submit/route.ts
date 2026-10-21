import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { submitForReview } from "@/lib/services/teachers";
export const POST = route(async () => {
  const u = await requirePermission("teach.manage_profile");
  await submitForReview(getDb(), u.id);
  return json({ ok: true });
});
