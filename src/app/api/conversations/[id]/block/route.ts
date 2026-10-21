import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setBlocked } from "@/lib/services/messaging";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const { blocked } = await parseBody(req, z.object({ blocked: z.boolean() }));
  await setBlocked(getDb(), u, (await params).id, blocked);
  return json({ ok: true });
});
