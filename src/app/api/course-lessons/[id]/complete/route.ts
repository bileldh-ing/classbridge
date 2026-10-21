import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { markLessonComplete } from "@/lib/services/courses";
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const r = await markLessonComplete(getDb(), u, (await params).id);
  return json({ complete: r.complete, certificateCode: r.certificate?.code ?? null });
});
