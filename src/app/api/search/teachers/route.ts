import { getDb } from "@/lib/db";
import { json, route, searchParamsObject } from "@/lib/api";
import { parseTeacherSearch } from "@/lib/validation/search";
import { searchTeachers } from "@/lib/services/teacher-search";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/services/rate-limit";
import { clientIp } from "@/lib/auth/session";

/** Public. Server-side filters + pagination; returns approximate public positions only. */
export const GET = route(async (req) => {
  await enforceRateLimit(getDb(), `search:${await clientIp()}`, 120, 60);
  const parsed = parseTeacherSearch(searchParamsObject(req.url));
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid search parameters", parsed.error.issues);
  const locale = new URL(req.url).searchParams.get("locale") ?? "en";
  return json(await searchTeachers(getDb(), parsed.data, locale));
});
