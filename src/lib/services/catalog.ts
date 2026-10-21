import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../db";
import { cities, lessonOfferings, subjectCategories, subjects } from "../db/schema";
import { computeSlots } from "./teachers";
import type { Locale } from "../i18n/messages";

export async function listSubjects(db: DbOrTx) {
  return db.select({ id: subjects.id, slug: subjects.slug, nameEn: subjects.nameEn, nameFr: subjects.nameFr, nameAr: subjects.nameAr, category: subjectCategories.slug, categoryEn: subjectCategories.nameEn, categoryFr: subjectCategories.nameFr, categoryAr: subjectCategories.nameAr })
    .from(subjects).innerJoin(subjectCategories, eq(subjectCategories.id, subjects.categoryId)).where(eq(subjects.isActive, true)).orderBy(asc(subjectCategories.sortOrder), asc(subjects.nameEn));
}
export const subjectName = (s: { nameEn: string; nameFr: string; nameAr: string }, l: Locale) => (l === "fr" ? s.nameFr : l === "ar" ? s.nameAr : s.nameEn);

export async function listCities(db: DbOrTx) {
  return db.select().from(cities).orderBy(asc(cities.country), asc(cities.name));
}

/** First bookable slot (next 14 days) for each teacher's shortest published offering. */
export async function nextAvailableSlots(db: DbOrTx, teacherIds: string[], now = new Date()) {
  const out = new Map<string, Date | null>();
  if (!teacherIds.length) return out;
  const offers = await db.select({ id: lessonOfferings.id, teacherId: lessonOfferings.teacherId, d: lessonOfferings.durationMinutes })
    .from(lessonOfferings).where(and(inArray(lessonOfferings.teacherId, teacherIds), eq(lessonOfferings.status, "published"))).orderBy(asc(lessonOfferings.durationMinutes));
  const pick = new Map<string, string>();
  for (const o of offers) if (!pick.has(o.teacherId)) pick.set(o.teacherId, o.id);
  await Promise.all(teacherIds.map(async (tid) => {
    const oid = pick.get(tid);
    if (!oid) return out.set(tid, null);
    const { slots } = await computeSlots(db, oid, now, new Date(now.getTime() + 14 * 86_400_000), now);
    out.set(tid, slots[0] ?? null);
  }));
  return out;
}
