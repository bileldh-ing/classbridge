import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { setCourseStatus } from "@/lib/services/courses";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_profile");
  const { status } = await parseBody(req, z.object({ status: z.enum(["draft", "published", "archived"]) }));
  await setCourseStatus(getDb(), u, (await params).id, status);
  return json({ ok: true });
});
