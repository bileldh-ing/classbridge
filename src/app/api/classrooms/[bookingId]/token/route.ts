import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { issueClassroomToken } from "@/lib/services/classroom";
import { getClassroomProvider } from "@/lib/classroom/provider";
import { enforceRateLimit } from "@/lib/services/rate-limit";

/** Short-lived, room-scoped LiveKit token for a participant inside the join window. */
export const POST = route<{ bookingId: string }>(async (_req, { params }) => {
  const u = await requireUser();
  await enforceRateLimit(getDb(), `lktoken:${u.id}`, 30, 600);
  return json(await issueClassroomToken(getDb(), u, (await params).bookingId, getClassroomProvider()));
});
