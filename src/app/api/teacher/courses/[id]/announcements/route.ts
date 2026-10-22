import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { announcementSchema, postAnnouncement } from "@/lib/services/lms-extra";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_profile");
  return json(await postAnnouncement(getDb(), u, (await params).id, await parseBody(req, announcementSchema)), 201);
});
