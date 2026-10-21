import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, parseBody, route } from "@/lib/api";
import { availabilitySchema, computeSlots, replaceAvailability } from "@/lib/services/teachers";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/auth/session";

const q = z.object({ offeringId: z.string().uuid(), from: z.coerce.date(), to: z.coerce.date() })
  .refine((v) => v.to > v.from && v.to.getTime() - v.from.getTime() <= 31 * 86_400_000, "range_max_31_days");

/** Public: bookable slots (UTC ISO strings) for a published offering. */
export const GET = route(async (req) => {
  const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) throw new AppError("VALIDATION_FAILED", "Invalid availability query", p.error.issues);
  const { offering, teacher, slots } = await computeSlots(getDb(), p.data.offeringId, p.data.from, p.data.to);
  if (offering.status !== "published" || teacher.publishState !== "published") throw new AppError("NOT_FOUND", "Offering not found");
  return json({ offeringId: offering.id, durationMinutes: offering.durationMinutes, teacherTimezone: teacher.timezone, slots: slots.map((s) => s.getTime()) });
});

/** Teacher: replace weekly availability rules. */
export const PUT = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  await replaceAvailability(getDb(), u.id, await parseBody(req, availabilitySchema));
  return json({ ok: true });
});
