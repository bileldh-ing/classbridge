import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { addException, deleteException, exceptionSchema } from "@/lib/services/teachers";
export const POST = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  await addException(getDb(), u.id, await parseBody(req, exceptionSchema));
  return json({ ok: true }, 201);
});
export const DELETE = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  const { id } = await parseBody(req, z.object({ id: z.string().uuid() }));
  await deleteException(getDb(), u.id, id);
  return json({ ok: true });
});
