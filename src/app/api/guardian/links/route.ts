import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { linkRequestSchema, listGuardianLinks, requestGuardianLink } from "@/lib/services/guardians";

export const GET = route(async () => {
  const u = await requireUser();
  return json({ items: await listGuardianLinks(getDb(), u) });
});
/** The consent token is only ever delivered to the learner's inbox/notifications, never returned here. */
export const POST = route(async (req) => {
  const u = await requireUser();
  const { id } = await requestGuardianLink(getDb(), u, await parseBody(req, linkRequestSchema));
  return json({ id, status: "pending" }, 201);
});
