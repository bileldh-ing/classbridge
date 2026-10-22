import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { gradingHistory } from "@/lib/services/lms-extra";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return json({ items: await gradingHistory(getDb(), u, (await params).id) });
});
