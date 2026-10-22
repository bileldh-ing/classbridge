import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { submissionSchema, submitAssignment } from "@/lib/services/lms-extra";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const s = await submitAssignment(getDb(), u, (await params).id, await parseBody(req, submissionSchema));
  return json({ id: s.id, status: s.status }, 201);
});
