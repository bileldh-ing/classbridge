import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { addQuestion, questionSchema } from "@/lib/services/courses";
import { z } from "zod";
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("teach.manage_profile");
  const body = await parseBody(req, questionSchema.and(z.object({ quizId: z.string().uuid() })));
  await addQuestion(getDb(), u, (await params).id, body.quizId, body);
  return json({ ok: true }, 201);
});
