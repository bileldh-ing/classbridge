import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { recordClassroomEvent } from "@/lib/services/classroom";

export const POST = route<{ bookingId: string }>(async (req, { params }) => {
  const u = await requireUser();
  const { kind } = await parseBody(req, z.object({ kind: z.enum(["joined", "left"]) }));
  await recordClassroomEvent(getDb(), u, (await params).bookingId, kind);
  return json({ ok: true });
});
