/** Teacher domain: public profile reads, owner profile/offering/availability/location management. */
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DbOrTx } from "../db";
import {
  availabilityExceptions, availabilityRules, bookings, cities, groupSessions, lessonOfferings, profiles, reviews, subjects,
  teacherBadges, teacherCredentials, teacherLocations, teacherProfiles, teacherSubjects, userRoles, users,
} from "../db/schema";
import { AppError } from "../errors";
import { LANGUAGES, LEVELS } from "../validation/search";
import { SUPPORTED_CURRENCIES } from "../money";
import { generateSlots, isValidTimezone } from "../scheduling/slots";
import { SLOT_OCCUPYING } from "../booking/state-machine";
import { publicPosition } from "../geo/approx";
import { audit } from "./audit";
import { POLICIES } from "../policy/cancellation";
import { profileCompleteness } from "./teacher-completeness";

export { profileCompleteness };

export async function getTeacherByUser(db: DbOrTx, userId: string) {
  const [t] = await db.select().from(teacherProfiles).where(eq(teacherProfiles.userId, userId));
  return t ?? null;
}

export async function requireTeacher(db: DbOrTx, userId: string) {
  const t = await getTeacherByUser(db, userId);
  if (!t) throw new AppError("FORBIDDEN", "Teacher profile required. Use “Become a teacher” first.");
  return t;
}

function slugify(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "teacher";
}

/** Role upgrade: same identity gains the teacher capability and a draft profile. */
export async function becomeTeacher(db: DB, userId: string) {
  return db.transaction(async (tx) => {
    const existing = await getTeacherByUser(tx, userId);
    if (existing) return existing;
    const [p] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
    if (!p) throw new AppError("NOT_FOUND", "Profile not found");
    await tx.insert(userRoles).values({ userId, role: "teacher" }).onConflictDoNothing();
    const base = slugify(p.displayName);
    const slug = `${base}-${userId.slice(0, 6)}`;
    const [t] = await tx.insert(teacherProfiles).values({ userId, slug, timezone: p.timezone }).returning();
    await audit(tx, { actorId: userId, action: "teacher.role_added", targetType: "user", targetId: userId });
    return t;
  });
}

export const teacherProfileSchema = z.object({
  headline: z.string().trim().min(10, "headline_short").max(120),
  bio: z.string().trim().min(80, "bio_short").max(4000),
  teachingApproach: z.string().trim().max(2000).default(""),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  languages: z.array(z.enum(LANGUAGES)).min(1, "languages_required").max(6),
  levels: z.array(z.enum(LEVELS)).min(1, "levels_required"),
  subjectIds: z.array(z.string().uuid()).min(1, "subjects_required").max(8),
  timezone: z.string().refine(isValidTimezone, "invalid_timezone"),
  hourlyRateMinor: z.coerce.number().int().min(0).max(10_000_000),
  currency: z.enum(SUPPORTED_CURRENCIES),
  offersOnline: z.boolean(),
  offersInPerson: z.boolean(),
  introVideoUrl: z.string().url().regex(/^https:\/\//).max(300).optional().or(z.literal("")),
  cancellationPolicy: z.enum(Object.keys(POLICIES) as [string, ...string[]]),
}).refine((v) => v.offersOnline || v.offersInPerson, { message: "mode_required", path: ["offersOnline"] });

export async function updateTeacherProfile(db: DB, userId: string, input: z.infer<typeof teacherProfileSchema>) {
  const t = await requireTeacher(db, userId);
  const valid = await db.select({ id: subjects.id }).from(subjects).where(and(inArray(subjects.id, input.subjectIds), eq(subjects.isActive, true)));
  if (valid.length !== input.subjectIds.length) throw new AppError("VALIDATION_FAILED", "Unknown subject selected");
  await db.transaction(async (tx) => {
    await tx.update(teacherProfiles).set({
      headline: input.headline, bio: input.bio, teachingApproach: input.teachingApproach, yearsExperience: input.yearsExperience,
      languages: input.languages, levels: input.levels, timezone: input.timezone, hourlyRateMinor: input.hourlyRateMinor,
      currency: input.currency, offersOnline: input.offersOnline, offersInPerson: input.offersInPerson,
      introVideoUrl: input.introVideoUrl || null, cancellationPolicy: input.cancellationPolicy, updatedAt: new Date(),
    }).where(eq(teacherProfiles.id, t.id));
    await tx.delete(teacherSubjects).where(eq(teacherSubjects.teacherId, t.id));
    await tx.insert(teacherSubjects).values(input.subjectIds.map((subjectId) => ({ teacherId: t.id, subjectId })));
  });
}

export const bookingSettingsSchema = z.object({
  minNoticeMinutes: z.coerce.number().int().min(0).max(14 * 1440),
  bufferMinutes: z.coerce.number().int().min(0).max(120),
  maxLessonsPerDay: z.coerce.number().int().min(1).max(16),
  bookingHorizonDays: z.coerce.number().int().min(1).max(120),
});
export async function updateBookingSettings(db: DB, userId: string, input: z.infer<typeof bookingSettingsSchema>) {
  const t = await requireTeacher(db, userId);
  await db.update(teacherProfiles).set({ ...input, updatedAt: new Date() }).where(eq(teacherProfiles.id, t.id));
}

// ------------------------------------------------------------------ location
export const locationSchema = z.object({
  cityId: z.string().uuid().optional(),
  geocoded: z.object({ label: z.string().max(300), lat: z.number(), lng: z.number(), placeId: z.string().max(200), city: z.string().max(100), country: z.string().length(2), provider: z.enum(["mapbox", "nominatim"]), permanent: z.boolean() }).optional(),
  visibility: z.enum(["private", "approximate", "public"]),
  storePrecise: z.boolean().default(false),
}).refine((v) => !!v.cityId !== !!v.geocoded, { message: "choose_one_location_source" });

/**
 * Saves the teacher's service location. Precise coordinates are stored only when the teacher opts in
 * AND the provider permits permanent storage; the public position is always derived separately.
 */
export async function setTeacherLocation(db: DB, userId: string, input: z.infer<typeof locationSchema>) {
  const t = await requireTeacher(db, userId);
  let row: typeof teacherLocations.$inferInsert;
  if (input.cityId) {
    const [c] = await db.select().from(cities).where(eq(cities.id, input.cityId));
    if (!c) throw new AppError("VALIDATION_FAILED", "Unknown city");
    // City-level: the public position is the city centre itself (no finer detail exists to leak).
    const vis = input.visibility;
    row = { teacherId: t.id, city: c.name, country: c.country, preciseLat: null, preciseLng: null,
      approxLat: vis === "private" ? null : c.lat, approxLng: vis === "private" ? null : c.lng,
      visibility: vis, source: "city_list", providerPlaceId: null, geocodedAt: null };
  } else {
    const g = input.geocoded!;
    const pos = publicPosition(g.lat, g.lng, input.visibility);
    if (input.visibility !== "private" && !pos) throw new AppError("VALIDATION_FAILED", "Invalid coordinates");
    const keepPrecise = input.storePrecise && g.permanent;
    row = { teacherId: t.id, city: g.city, country: g.country.toUpperCase(),
      preciseLat: keepPrecise ? g.lat : null, preciseLng: keepPrecise ? g.lng : null,
      approxLat: pos?.lat ?? null, approxLng: pos?.lng ?? null, visibility: input.visibility,
      source: g.provider, providerPlaceId: g.permanent ? g.placeId : null, geocodedAt: new Date() };
  }
  await db.insert(teacherLocations).values(row).onConflictDoUpdate({ target: teacherLocations.teacherId, set: { ...row, updatedAt: new Date() } });
}

// ------------------------------------------------------------------ offerings
export const offeringSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).default(""),
  type: z.enum(["trial", "one_to_one", "group"]),
  subjectId: z.string().uuid().optional().nullable(),
  durationMinutes: z.coerce.number().int().refine((v) => [30, 45, 60, 90, 120].includes(v), "invalid_duration"),
  priceMinor: z.coerce.number().int().min(0).max(10_000_000),
  mode: z.enum(["online", "in_person"]),
  capacity: z.coerce.number().int().min(1).max(50).default(1),
  intakeQuestion: z.string().trim().max(300).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).default("published"),
});

export async function upsertOffering(db: DB, userId: string, input: z.infer<typeof offeringSchema>, offeringId?: string) {
  const t = await requireTeacher(db, userId);
  if (input.type === "group") throw new AppError("VALIDATION_FAILED", "Group lessons are not yet supported for booking.");
  if (input.mode === "in_person" && !t.offersInPerson) throw new AppError("VALIDATION_FAILED", "Enable in-person lessons on your profile first.");
  if (input.mode === "online" && !t.offersOnline) throw new AppError("VALIDATION_FAILED", "Enable online lessons on your profile first.");
  const values = { ...input, capacity: 1, currency: t.currency, cancellationPolicy: t.cancellationPolicy, teacherId: t.id, updatedAt: new Date() };
  if (offeringId) {
    const [o] = await db.update(lessonOfferings).set(values).where(and(eq(lessonOfferings.id, offeringId), eq(lessonOfferings.teacherId, t.id))).returning();
    if (!o) throw new AppError("NOT_FOUND", "Offering not found");
    return o;
  }
  const [o] = await db.insert(lessonOfferings).values(values).returning();
  return o;
}

// ------------------------------------------------------------------ availability
export const availabilitySchema = z.object({
  rules: z.array(z.object({
    weekday: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  }).refine((r) => r.startMinute < r.endMinute, "start_before_end")).max(50),
});

export async function replaceAvailability(db: DB, userId: string, input: z.infer<typeof availabilitySchema>) {
  const t = await requireTeacher(db, userId);
  // reject overlapping windows on the same weekday
  for (let d = 1; d <= 7; d++) {
    const day = input.rules.filter((r) => r.weekday === d).sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < day.length; i++) if (day[i].startMinute < day[i - 1].endMinute) throw new AppError("VALIDATION_FAILED", "Availability windows overlap");
  }
  await db.transaction(async (tx) => {
    await tx.delete(availabilityRules).where(eq(availabilityRules.teacherId, t.id));
    if (input.rules.length) await tx.insert(availabilityRules).values(input.rules.map((r) => ({ ...r, teacherId: t.id })));
  });
}

export const exceptionSchema = z.object({
  kind: z.enum(["blocked", "extra"]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().max(200).optional(),
}).refine((v) => v.startsAt < v.endsAt, "start_before_end");

export async function addException(db: DB, userId: string, input: z.infer<typeof exceptionSchema>) {
  const t = await requireTeacher(db, userId);
  await db.insert(availabilityExceptions).values({ ...input, teacherId: t.id });
}
export async function deleteException(db: DB, userId: string, id: string) {
  const t = await requireTeacher(db, userId);
  await db.delete(availabilityExceptions).where(and(eq(availabilityExceptions.id, id), eq(availabilityExceptions.teacherId, t.id)));
}

/** Bookable slots for an offering between from/to (server-side truth; also used to validate bookings). */
export async function computeSlots(db: DbOrTx, offeringId: string, from: Date, to: Date, now = new Date(), opts: { excludeBookingId?: string } = {}) {
  const [row] = await db.select({ o: lessonOfferings, t: teacherProfiles }).from(lessonOfferings)
    .innerJoin(teacherProfiles, eq(teacherProfiles.id, lessonOfferings.teacherId))
    .where(eq(lessonOfferings.id, offeringId));
  if (!row) throw new AppError("NOT_FOUND", "Offering not found");
  const { o, t } = row;
  // Sequential on purpose: this runs inside booking transactions (single connection).
  const rules = await db.select().from(availabilityRules).where(eq(availabilityRules.teacherId, t.id));
  const exceptions = await db.select().from(availabilityExceptions).where(and(eq(availabilityExceptions.teacherId, t.id), lt(availabilityExceptions.startsAt, to), gte(availabilityExceptions.endsAt, new Date(from.getTime() - 86_400_000))));
  const busy = await db.select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt }).from(bookings).where(and(
    eq(bookings.teacherId, t.id), inArray(bookings.status, SLOT_OCCUPYING),
    lt(bookings.startsAt, new Date(to.getTime() + 86_400_000)), gte(bookings.endsAt, new Date(from.getTime() - 86_400_000)),
    // stale holds do not block (they are expired lazily on the next write)
    sql`NOT (${bookings.status} IN ('slot_held','awaiting_payment') AND ${bookings.holdExpiresAt} < now())`,
    // group seats are represented by their group session below
    isNull(bookings.groupSessionId),
    opts.excludeBookingId ? ne(bookings.id, opts.excludeBookingId) : sql`true`,
  ));
  const groupBusy = await db.select({ startsAt: groupSessions.startsAt, endsAt: groupSessions.endsAt }).from(groupSessions).where(and(
    eq(groupSessions.teacherId, t.id), eq(groupSessions.status, "scheduled"),
    lt(groupSessions.startsAt, new Date(to.getTime() + 86_400_000)), gte(groupSessions.endsAt, new Date(from.getTime() - 86_400_000)),
  ));
  busy.push(...groupBusy);
  const slots = generateSlots({
    rules, exceptions, busy, teacherTimezone: t.timezone, durationMinutes: o.durationMinutes, bufferMinutes: t.bufferMinutes,
    minNoticeMinutes: t.minNoticeMinutes, maxLessonsPerDay: t.maxLessonsPerDay, horizonDays: t.bookingHorizonDays, now, from, to,
  });
  return { offering: o, teacher: t, slots };
}

// ------------------------------------------------------------------ public profile
export async function getPublicTeacher(db: DbOrTx, slug: string) {
  const [row] = await db.select({ t: teacherProfiles, p: profiles, status: users.status }).from(teacherProfiles)
    .innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId))
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .where(eq(teacherProfiles.slug, slug));
  if (!row || row.t.publishState !== "published" || row.status !== "active") return null;
  const t = row.t;
  const [subs, offerings, badges, creds, loc, revs, agg] = await Promise.all([
    db.select({ id: subjects.id, slug: subjects.slug, nameEn: subjects.nameEn, nameFr: subjects.nameFr, nameAr: subjects.nameAr })
      .from(teacherSubjects).innerJoin(subjects, eq(subjects.id, teacherSubjects.subjectId)).where(eq(teacherSubjects.teacherId, t.id)),
    db.select().from(lessonOfferings).where(and(eq(lessonOfferings.teacherId, t.id), eq(lessonOfferings.status, "published"))).orderBy(asc(lessonOfferings.priceMinor)),
    db.select({ badge: teacherBadges.badge, grantedAt: teacherBadges.grantedAt }).from(teacherBadges).where(and(eq(teacherBadges.teacherId, t.id), isNull(teacherBadges.revokedAt))),
    // Only metadata + review status — never the private file key.
    db.select({ id: teacherCredentials.id, title: teacherCredentials.title, issuer: teacherCredentials.issuer, issuedYear: teacherCredentials.issuedYear, status: teacherCredentials.status })
      .from(teacherCredentials).where(and(eq(teacherCredentials.teacherId, t.id), inArray(teacherCredentials.status, ["submitted", "approved"]))),
    db.select({ city: teacherLocations.city, country: teacherLocations.country, visibility: teacherLocations.visibility, approxLat: teacherLocations.approxLat, approxLng: teacherLocations.approxLng })
      .from(teacherLocations).where(eq(teacherLocations.teacherId, t.id)),
    db.select({ id: reviews.id, rating: reviews.rating, body: reviews.body, createdAt: reviews.createdAt, teacherResponse: reviews.teacherResponse, isDemo: reviews.isDemo, author: profiles.displayName })
      .from(reviews).innerJoin(profiles, eq(profiles.userId, reviews.studentId))
      .where(and(eq(reviews.teacherId, t.id), eq(reviews.status, "published"))).orderBy(desc(reviews.createdAt)).limit(20),
    db.select({ avg: sql<string | null>`round(avg(${reviews.rating})::numeric, 2)`, cnt: sql<number>`count(*)::int` })
      .from(reviews).where(and(eq(reviews.teacherId, t.id), eq(reviews.status, "published"))),
  ]);
  const l = loc[0];
  return {
    id: t.id, slug: t.slug, userId: t.userId, displayName: row.p.displayName, avatarUrl: row.p.avatarUrl,
    headline: t.headline, bio: t.bio, teachingApproach: t.teachingApproach, yearsExperience: t.yearsExperience,
    languages: t.languages, levels: t.levels, timezone: t.timezone, hourlyRateMinor: t.hourlyRateMinor, currency: t.currency,
    offersOnline: t.offersOnline, offersInPerson: t.offersInPerson, introVideoUrl: t.introVideoUrl, isDemo: t.isDemo,
    cancellationPolicy: t.cancellationPolicy, subjects: subs, offerings, badges, credentials: creds,
    // Public location: city + approximate point only (never precise fields).
    location: l ? { city: l.city, country: l.country, position: l.visibility !== "private" && l.approxLat !== null && l.approxLng !== null ? { lat: l.approxLat, lng: l.approxLng } : null, visibility: l.visibility } : null,
    reviews: revs, ratingAvg: agg[0]?.avg ? Number(agg[0].avg) : null, ratingCount: agg[0]?.cnt ?? 0,
  };
}

export async function submitForReview(db: DB, userId: string) {
  const t = await requireTeacher(db, userId);
  const c = await profileCompleteness(db, t.id);
  if (c.missing.length) throw new AppError("VALIDATION_FAILED", "Profile incomplete", { missing: c.missing });
  const [u] = await db.select({ v: users.emailVerifiedAt }).from(users).where(eq(users.id, userId));
  if (!u?.v) throw new AppError("NOT_ELIGIBLE", "Verify your email address before submitting your profile.");
  if (!["draft", "rejected"].includes(t.publishState)) throw new AppError("INVALID_TRANSITION", `Profile is ${t.publishState}`);
  await db.transaction(async (tx) => {
    await tx.update(teacherProfiles).set({ publishState: "pending_review", updatedAt: new Date() }).where(eq(teacherProfiles.id, t.id));
    await audit(tx, { actorId: userId, action: "teacher.submitted_for_review", targetType: "teacher_profile", targetId: t.id });
  });
}
