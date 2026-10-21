import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { createReview, reviewSchema } from "@/lib/services/reviews";

export const POST = route(async (req) => {
  const u = await requirePermission("learn.review");
  const r = await createReview(getDb(), u, await parseBody(req, reviewSchema));
  return json({ id: r.id }, 201);
});
