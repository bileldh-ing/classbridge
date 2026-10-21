import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { setActiveRole } from "@/lib/auth/core";
import { requireUser } from "@/lib/auth/session";

/** Switches the active app context; permissions still come from the user's role memberships. */
export const POST = route(async (req) => {
  const u = await requireUser();
  const { role } = await parseBody(req, z.object({ role: z.enum(["student", "teacher", "admin"]) }));
  await setActiveRole(getDb(), u.sessionId, role, u.roles);
  return json({ ok: true });
});
