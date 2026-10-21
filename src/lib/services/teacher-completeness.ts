import { eq, and, sql } from "drizzle-orm";
import type { DbOrTx } from "../db";
import { availabilityRules, lessonOfferings, teacherProfiles, teacherSubjects, teacherLocations } from "../db/schema";

/** Owner-only completeness indicator; also the gate for submitting a profile for review. */
export async function profileCompleteness(db: DbOrTx, teacherId: string) {
  const [t] = await db.select().from(teacherProfiles).where(eq(teacherProfiles.id, teacherId));
  const [[subj], [offer], [avail], [loc]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(teacherSubjects).where(eq(teacherSubjects.teacherId, teacherId)),
    db.select({ n: sql<number>`count(*)::int` }).from(lessonOfferings).where(and(eq(lessonOfferings.teacherId, teacherId), eq(lessonOfferings.status, "published"))),
    db.select({ n: sql<number>`count(*)::int` }).from(availabilityRules).where(eq(availabilityRules.teacherId, teacherId)),
    db.select({ n: sql<number>`count(*)::int` }).from(teacherLocations).where(eq(teacherLocations.teacherId, teacherId)),
  ]);
  const checks: Array<[string, boolean]> = [
    ["headline", (t?.headline.length ?? 0) >= 10],
    ["bio", (t?.bio.length ?? 0) >= 80],
    ["languages", (t?.languages.length ?? 0) > 0],
    ["levels", (t?.levels.length ?? 0) > 0],
    ["subjects", subj.n > 0],
    ["offering", offer.n > 0],
    ["availability", avail.n > 0],
    ["location", !t?.offersInPerson || loc.n > 0],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([k]) => k);
  return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}
