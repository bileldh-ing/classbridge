import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { getGeocoder } from "@/lib/geo/geocoding";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/services/rate-limit";

/** Teacher-only place lookup through the configured provider. Results are not stored here. */
export const GET = route(async (req) => {
  const u = await requirePermission("teach.manage_profile");
  await enforceRateLimit(getDb(), `geocode:${u.id}`, 20, 60);
  const p = z.object({ q: z.string().trim().min(2).max(120), country: z.string().length(2).optional() }).safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) throw new AppError("VALIDATION_FAILED", "Invalid query");
  const g = getGeocoder();
  if (!g) throw new AppError("GEOCODER_NOT_CONFIGURED", "No geocoding provider configured. Choose your city from the list instead.");
  const results = await g.search(p.data.q, { country: p.data.country, limit: 5 });
  return json({ provider: g.name, permanent: g.permanentStorageAllowed, items: results });
});
