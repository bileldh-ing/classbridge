import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { rescheduleBooking, rescheduleSchema } from "@/lib/services/reschedule";

/** Atomically moves a confirmed 1:1 lesson to another free slot (policy: notice + max reschedules). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const input = await parseBody(req, rescheduleSchema);
  return json(await rescheduleBooking(getDb(), u, (await params).id, input));
});
