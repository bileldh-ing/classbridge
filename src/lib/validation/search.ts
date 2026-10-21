import { z } from "zod";

export const LEVELS = ["primary", "secondary", "university", "adult", "exam_prep"] as const;
export const LANGUAGES = ["en", "fr", "ar", "de", "es", "it"] as const;
export const SORTS = ["relevance", "price_asc", "price_desc", "rating", "newest"] as const;

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const boolish = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

export const teacherSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  subject: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
  level: z.enum(LEVELS).optional(),
  language: z.enum(LANGUAGES).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  minPrice: num(0, 100000).optional(),
  maxPrice: num(0, 100000).optional(),
  mode: z.enum(["online", "in_person"]).optional(),
  city: z.string().trim().max(80).optional(),
  lat: num(-90, 90).optional(),
  lng: num(-180, 180).optional(),
  radiusKm: num(1, 300).optional(),
  bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).optional(),
  minRating: num(1, 5).optional(),
  verified: boolish.optional(),
  sort: z.enum(SORTS).default("relevance"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
}).refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, { message: "min_gt_max", path: ["minPrice"] })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "lat_lng_pair", path: ["lat"] });

export type TeacherSearch = z.infer<typeof teacherSearchSchema>;

/** Parses URLSearchParams-ish input, dropping empty strings so blank form fields are ignored. */
export function parseTeacherSearch(input: Record<string, string | string[] | undefined>) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s !== undefined && s !== "") clean[k] = s;
  }
  return teacherSearchSchema.safeParse(clean);
}

/** Canonical serialisation: stable key order, defaults omitted (cache keys, canonical URLs). */
export function serializeTeacherSearch(s: Partial<TeacherSearch>): string {
  const p = new URLSearchParams();
  for (const k of Object.keys(s).sort()) {
    const v = (s as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === "") continue;
    if (k === "sort" && v === "relevance") continue;
    if (k === "page" && v === 1) continue;
    if (k === "pageSize" && v === 12) continue;
    p.set(k, String(v));
  }
  return p.toString();
}
