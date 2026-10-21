import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { availabilityRules, lessonOfferings, profiles, teacherProfiles, userRoles, users, teacherSubjects, subjects, subjectCategories } from "@/lib/db/schema";
import type { Principal, Role } from "@/lib/auth/permissions";
import { randomToken } from "@/lib/crypto";

export const db = () => getDb();

export async function resetDb() {
  const tables = await db().execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(", ");
  // Append-only triggers block DELETE but not TRUNCATE (which is the intended admin-only reset path).
  if (names) await db().execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

export async function makeUser(roles: Role[] = ["student"], name = "Test User"): Promise<Principal & { email: string }> {
  const email = `u-${randomToken(6)}@example.test`.toLowerCase();
  const [u] = await db().insert(users).values({ email, passwordHash: "x", emailVerifiedAt: new Date() }).returning();
  await db().insert(profiles).values({ userId: u.id, displayName: name, timezone: "UTC" });
  for (const role of roles) await db().insert(userRoles).values({ userId: u.id, role });
  return { id: u.id, roles, status: "active", email };
}

/** A published teacher available every day 00:00–24:00 UTC, no notice/buffer, so tests control time precisely. */
export async function makeTeacher(opts: { priceMinor?: number; mode?: "online" | "in_person"; bufferMinutes?: number } = {}) {
  const user = await makeUser(["student", "teacher"], "Teacher T");
  const [t] = await db().insert(teacherProfiles).values({
    userId: user.id, slug: `t-${randomToken(5).toLowerCase()}`, headline: "Experienced maths teacher", bio: "b".repeat(100),
    languages: ["en"], levels: ["secondary"], timezone: "UTC", hourlyRateMinor: 3000, currency: "EUR",
    offersOnline: true, offersInPerson: opts.mode === "in_person", publishState: "published", publishedAt: new Date(),
    minNoticeMinutes: 0, bufferMinutes: opts.bufferMinutes ?? 0, maxLessonsPerDay: 16, bookingHorizonDays: 60,
  }).returning();
  const [o] = await db().insert(lessonOfferings).values({
    teacherId: t.id, title: "Lesson", durationMinutes: 60, priceMinor: opts.priceMinor ?? 3000, currency: "EUR",
    mode: opts.mode ?? "online", status: "published",
  }).returning();
  for (let d = 1; d <= 7; d++) await db().insert(availabilityRules).values({ teacherId: t.id, weekday: d, startMinute: 0, endMinute: 1440 });
  return { user, teacher: t, offering: o };
}

export async function makeSubject(slug = "mathematics") {
  const [c] = await db().insert(subjectCategories).values({ slug: `cat-${slug}`, nameEn: "Cat", nameFr: "Cat", nameAr: "Cat" }).onConflictDoNothing().returning();
  const [s] = await db().insert(subjects).values({ slug, categoryId: c.id, nameEn: slug, nameFr: slug, nameAr: slug }).returning();
  return s;
}
export async function linkSubject(teacherId: string, subjectId: string) {
  await db().insert(teacherSubjects).values({ teacherId, subjectId });
}

/** Next whole hour at least `hoursAhead` in the future (UTC). */
export function futureHour(hoursAhead = 48) {
  const d = new Date(Date.now() + hoursAhead * 3600_000);
  d.setUTCMinutes(0, 0, 0);
  return d;
}
