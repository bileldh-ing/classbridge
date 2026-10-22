import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setBookmark } from "@/lib/services/lms-extra";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const { on } = await parseBody(req, z.object({ on: z.boolean() }));
  return json(await setBookmark(getDb(), u, (await params).id, on));
});
