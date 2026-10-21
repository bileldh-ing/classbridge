import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enrollFree, startCourseCheckout } from "@/lib/services/courses";
import { getPaymentProvider } from "@/lib/payments/stripe";
import { AppError } from "@/lib/errors";

/** Free courses enroll immediately; paid courses return a provider checkout URL (enrollment happens on verified webhook). */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const { id } = await params;
  const [c] = await getDb().select().from(courses).where(eq(courses.id, id));
  if (!c) throw new AppError("NOT_FOUND", "Course not found");
  if (c.priceMinor === 0) { await enrollFree(getDb(), u, id); return json({ ok: true }); }
  return json(await startCourseCheckout(getDb(), u, id, getPaymentProvider()));
});
