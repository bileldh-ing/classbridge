import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { addSection } from "@/lib/services/courses";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_profile");
  const { title } = await parseBody(req, z.object({ title: z.string().trim().min(2).max(140) }));
  const s = await addSection(getDb(), u, (await params).id, title);
  return json({ id: s.id }, 201);
});
