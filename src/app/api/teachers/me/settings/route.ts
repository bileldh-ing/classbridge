import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { bookingSettingsSchema, updateBookingSettings } from "@/lib/services/teachers";
export const PUT = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  await updateBookingSettings(getDb(), u.id, await parseBody(req, bookingSettingsSchema));
  return json({ ok: true });
});
