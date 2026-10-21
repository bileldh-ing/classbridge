/**
 * Development/test seed: a coherent, clearly-labelled DEMO world.
 * - Refuses to run when NODE_ENV=production.
 * - Every demo person is fictitious and flagged is_demo=true; names carry "(Demo)".
 * - Demo reviews belong to demo completed bookings and are flagged is_demo=true.
 * - City coordinates are approximate city centres from a manually compiled list (source recorded per row).
 * - No badges are granted by the seed; credentials are left "submitted" for the admin verification demo.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { DateTime } from "luxon";
import { randomBytes } from "node:crypto";
import { loadEnvFile } from "./load-env";
import * as s from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { platformFee } from "../src/lib/money";

loadEnvFile();
if (process.env.NODE_ENV === "production") { console.error("Refusing to seed demo data in production."); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://classbridge:classbridge@127.0.0.1:54329/classbridge" });
const db = drizzle(pool, { schema: s });
const DEMO_PASSWORD = "DemoPass123!";
const room = () => `cb-${randomBytes(12).toString("base64url")}`;

const CATEGORIES = [
  { slug: "languages", nameEn: "Languages", nameFr: "Langues", nameAr: "اللغات", sortOrder: 1 },
  { slug: "stem", nameEn: "Science & maths", nameFr: "Sciences et maths", nameAr: "العلوم والرياضيات", sortOrder: 2 },
  { slug: "computing", nameEn: "Computing", nameFr: "Informatique", nameAr: "الحوسبة", sortOrder: 3 },
  { slug: "music", nameEn: "Music", nameFr: "Musique", nameAr: "الموسيقى", sortOrder: 4 },
];
const SUBJECTS: Array<[string, string, string, string, string]> = [
  ["languages", "french", "French", "Français", "الفرنسية"], ["languages", "english", "English", "Anglais", "الإنجليزية"],
  ["languages", "arabic", "Arabic", "Arabe", "العربية"], ["languages", "spanish", "Spanish", "Espagnol", "الإسبانية"],
  ["stem", "mathematics", "Mathematics", "Mathématiques", "الرياضيات"], ["stem", "physics", "Physics", "Physique", "الفيزياء"],
  ["stem", "chemistry", "Chemistry", "Chimie", "الكيمياء"], ["computing", "python", "Python programming", "Programmation Python", "برمجة بايثون"],
  ["computing", "web-development", "Web development", "Développement web", "تطوير الويب"], ["music", "piano", "Piano", "Piano", "البيانو"],
  ["music", "guitar", "Guitar", "Guitare", "الغيتار"],
];
// Approximate city-centre coordinates (manually compiled reference values; verify with a geocoder before production use).
const CITY_SOURCE = "manual_city_centre_list_v1 (approximate; verify before production)";
const CITIES: Array<[string, string, number, number]> = [
  ["Tunis", "TN", 36.8065, 10.1815], ["Sousse", "TN", 35.8256, 10.6084], ["Sfax", "TN", 34.7406, 10.7603], ["Monastir", "TN", 35.7643, 10.8113],
  ["Paris", "FR", 48.8566, 2.3522], ["Lyon", "FR", 45.764, 4.8357], ["Marseille", "FR", 43.2965, 5.3698], ["Brussels", "BE", 50.8503, 4.3517],
  ["Geneva", "CH", 46.2044, 6.1432], ["Montreal", "CA", 45.5019, -73.5674], ["London", "GB", 51.5072, -0.1276], ["Casablanca", "MA", 33.5731, -7.5898],
  ["Algiers", "DZ", 36.7538, 3.0588], ["Berlin", "DE", 52.52, 13.405],
];

type DemoTeacher = { name: string; email: string; headline: string; bio: string; approach: string; years: number; langs: string[]; levels: string[]; subjects: string[];
  tz: string; rateMinor: number; currency: string; inPerson: boolean; city?: string; visibility?: "approximate" | "private"; state?: "published" | "pending_review" };

const TEACHERS: DemoTeacher[] = [
  { name: "Amira B. (Demo)", email: "amira.demo@classbridge.test", headline: "Mathematics for baccalaureate and first-year university", years: 9, langs: ["fr", "ar", "en"], levels: ["secondary", "university", "exam_prep"], subjects: ["mathematics", "physics"], tz: "Africa/Tunis", rateMinor: 35000, currency: "TND", inPerson: true, city: "Tunis",
    bio: "DEMO PROFILE — fictitious teacher for development. I help students build solid foundations in algebra, analysis and probability, with structured practice and past exam papers. Lessons combine short explanations with guided exercises.", approach: "Diagnostic first lesson, then a weekly plan with targeted exercises and short reviews." },
  { name: "Lucas M. (Demo)", email: "lucas.demo@classbridge.test", headline: "Conversational French and DELF preparation", years: 6, langs: ["fr", "en"], levels: ["adult", "exam_prep", "secondary"], subjects: ["french"], tz: "Europe/Paris", rateMinor: 3200, currency: "EUR", inPerson: true, city: "Lyon",
    bio: "DEMO PROFILE — fictitious teacher for development. Native French speaker focusing on speaking confidence, pronunciation and DELF B1/B2 exam strategies. Every lesson ends with a short written recap.", approach: "Communicative method: real-life situations, then grammar where it helps." },
  { name: "Sara K. (Demo)", email: "sara.demo@classbridge.test", headline: "Python and data analysis from zero to projects", years: 5, langs: ["en", "ar"], levels: ["university", "adult"], subjects: ["python", "web-development"], tz: "Europe/London", rateMinor: 4000, currency: "GBP", inPerson: false,
    bio: "DEMO PROFILE — fictitious teacher for development. Software engineer teaching practical Python: syntax, data structures, pandas and small automation projects. Students leave each lesson with working code they wrote.", approach: "Project-based learning with code reviews and pair programming." },
  { name: "Youssef T. (Demo)", email: "youssef.demo@classbridge.test", headline: "Physics and chemistry tutoring for secondary school", years: 11, langs: ["ar", "fr"], levels: ["secondary", "exam_prep"], subjects: ["physics", "chemistry"], tz: "Africa/Tunis", rateMinor: 30000, currency: "TND", inPerson: true, city: "Sousse",
    bio: "DEMO PROFILE — fictitious teacher for development. Experienced secondary-school tutor. I focus on understanding the experiment behind each formula and on methodical problem solving for national exams.", approach: "Concept maps, worked examples, then timed practice." },
  { name: "Emma W. (Demo)", email: "emma.demo@classbridge.test", headline: "English for work, IELTS speaking and writing", years: 8, langs: ["en", "fr"], levels: ["adult", "exam_prep", "university"], subjects: ["english"], tz: "America/Toronto", rateMinor: 4500, currency: "CAD", inPerson: true, city: "Montreal",
    bio: "DEMO PROFILE — fictitious teacher for development. I coach professionals and university students in clear spoken and written English, with IELTS-style speaking practice and detailed writing feedback.", approach: "Short input, lots of speaking time, written feedback after each lesson." },
  { name: "Karim D. (Demo)", email: "karim.demo@classbridge.test", headline: "Piano lessons for beginners and returning adults", years: 14, langs: ["fr", "ar"], levels: ["primary", "secondary", "adult"], subjects: ["piano"], tz: "Africa/Casablanca", rateMinor: 25000, currency: "MAD", inPerson: true, city: "Casablanca", visibility: "private",
    bio: "DEMO PROFILE — fictitious teacher for development. Classical and popular repertoire, reading music and ear training. Lessons are adapted to each learner's goals, from first notes to grade exams.", approach: "Technique in small steps, a piece you enjoy every month." },
  { name: "Nadia F. (Demo)", email: "nadia.demo@classbridge.test", headline: "Arabic for non-native speakers (MSA and Tunisian dialect)", years: 7, langs: ["ar", "fr", "en"], levels: ["adult", "university"], subjects: ["arabic"], tz: "Africa/Tunis", rateMinor: 2500, currency: "EUR", inPerson: false,
    bio: "DEMO PROFILE — fictitious teacher for development. I teach Modern Standard Arabic and Tunisian dialect to adults, with reading, listening and conversation practice built around everyday topics.", approach: "Alphabet and sounds first, then dialogues and vocabulary in context." },
  { name: "Pierre L. (Demo)", email: "pierre.demo@classbridge.test", headline: "Web development: HTML, CSS, JavaScript and React", years: 4, langs: ["fr", "en"], levels: ["university", "adult"], subjects: ["web-development", "python"], tz: "Europe/Paris", rateMinor: 3800, currency: "EUR", inPerson: true, city: "Paris", state: "pending_review",
    bio: "DEMO PROFILE — fictitious teacher for development, awaiting review. Front-end developer teaching modern web fundamentals and React through small, deployable projects with code review.", approach: "Build something real in every lesson." },
];

async function main() {
  console.log("Seeding DEMO data…");
  const pw = await hashPassword(DEMO_PASSWORD);
  // Wipe app data (dev/test only). TRUNCATE bypasses the append-only row triggers by design.
  const tables = await db.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  await db.execute(sql.raw(`TRUNCATE ${tables.rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`));

  const cats = await db.insert(s.subjectCategories).values(CATEGORIES).returning();
  const subjRows = await db.insert(s.subjects).values(SUBJECTS.map(([cat, slug, en, fr, ar]) => ({ categoryId: cats.find((c) => c.slug === cat)!.id, slug, nameEn: en, nameFr: fr, nameAr: ar }))).returning();
  const cityRows = await db.insert(s.cities).values(CITIES.map(([name, country, lat, lng]) => ({ name, country, lat, lng, source: CITY_SOURCE }))).returning();

  async function user(email: string, name: string, roles: Array<"student" | "teacher" | "admin" | "support">, tz = "UTC", locale = "en") {
    const [u] = await db.insert(s.users).values({ email, passwordHash: pw, emailVerifiedAt: new Date(), isDemo: true }).returning();
    await db.insert(s.profiles).values({ userId: u.id, displayName: name, timezone: tz, locale, isAdultConfirmed: true, onboardingStep: "done" });
    for (const role of roles) await db.insert(s.userRoles).values({ userId: u.id, role });
    for (const [type, v] of [["terms", true], ["privacy", true], ["marketing", false]] as const) await db.insert(s.consentRecords).values({ userId: u.id, consentType: type, policyVersion: "2026-10-21", value: v, source: "seed" });
    return u;
  }

  const admin = await user("admin@classbridge.test", "Admin (Demo)", ["admin", "student"], "Africa/Tunis");
  await user("support@classbridge.test", "Support Agent (Demo)", ["support"], "Africa/Tunis");
  const student = await user("student@classbridge.test", "Lina S. (Demo student)", ["student"], "Africa/Tunis", "fr");
  const student2 = await user("student2@classbridge.test", "Omar H. (Demo student)", ["student"], "Europe/Paris");

  const now = DateTime.utc();
  const teacherIds: Record<string, { id: string; userId: string; trialId: string; paidId: string; tz: string }> = {};
  for (const [i, t] of TEACHERS.entries()) {
    const u = await user(t.email, t.name, ["student", "teacher"], t.tz, t.langs[0] === "ar" ? "ar" : t.langs[0] === "fr" ? "fr" : "en");
    const state = t.state ?? "published";
    const [tp] = await db.insert(s.teacherProfiles).values({
      userId: u.id, slug: `${t.name.split(" ")[0].toLowerCase()}-demo-${i + 1}`, headline: t.headline, bio: t.bio, teachingApproach: t.approach,
      yearsExperience: t.years, languages: t.langs, levels: t.levels, timezone: t.tz, hourlyRateMinor: t.rateMinor, currency: t.currency,
      offersOnline: true, offersInPerson: t.inPerson, publishState: state, isDemo: true, publishedAt: state === "published" ? now.minus({ days: 30 - i }).toJSDate() : null,
      minNoticeMinutes: 120, bufferMinutes: 10, maxLessonsPerDay: 6, bookingHorizonDays: 28, cancellationPolicy: i % 3 === 2 ? "moderate-48h-v1" : "flex-24h-v1",
    }).returning();
    await db.insert(s.teacherSubjects).values(t.subjects.map((slug) => ({ teacherId: tp.id, subjectId: subjRows.find((x) => x.slug === slug)!.id })));
    if (t.city) {
      const c = cityRows.find((x) => x.name === t.city)!;
      const vis = t.visibility ?? "approximate";
      await db.insert(s.teacherLocations).values({ teacherId: tp.id, city: c.name, country: c.country, approxLat: vis === "private" ? null : c.lat, approxLng: vis === "private" ? null : c.lng, visibility: vis, source: "city_list" });
    }
    const subjId = subjRows.find((x) => x.slug === t.subjects[0])!.id;
    const [trial] = await db.insert(s.lessonOfferings).values({ teacherId: tp.id, subjectId: subjId, type: "trial", title: "Free 30-minute trial lesson (Demo)", description: "Meet the teacher, discuss your goals and try a short exercise.", durationMinutes: 30, priceMinor: 0, currency: t.currency, mode: "online", status: "published", cancellationPolicy: tp.cancellationPolicy }).returning();
    const [paid] = await db.insert(s.lessonOfferings).values({ teacherId: tp.id, subjectId: subjId, type: "one_to_one", title: "60-minute private lesson (Demo)", description: "A full lesson tailored to your level.", durationMinutes: 60, priceMinor: t.rateMinor, currency: t.currency, mode: "online", status: "published", cancellationPolicy: tp.cancellationPolicy, intakeQuestion: "What would you like to focus on?" }).returning();
    if (t.inPerson) await db.insert(s.lessonOfferings).values({ teacherId: tp.id, subjectId: subjId, type: "one_to_one", title: "60-minute in-person lesson (Demo)", description: "In-person lesson in the teacher's service area.", durationMinutes: 60, priceMinor: t.rateMinor, currency: t.currency, mode: "in_person", status: "published", cancellationPolicy: tp.cancellationPolicy });
    // Weekly availability in the teacher's timezone: weekdays 09:00–12:00 and 14:00–19:00, Saturday 10:00–13:00
    const rules = [1, 2, 3, 4, 5].flatMap((d) => [{ weekday: d, startMinute: 540, endMinute: 720 }, { weekday: d, startMinute: 840, endMinute: 1140 }]).concat([{ weekday: 6, startMinute: 600, endMinute: 780 }]);
    await db.insert(s.availabilityRules).values(rules.map((r) => ({ ...r, teacherId: tp.id })));
    if (state === "pending_review") {
      await db.insert(s.teacherCredentials).values({ teacherId: tp.id, title: "MSc Computer Science (Demo record)", issuer: "Demo University", issuedYear: 2020, status: "submitted" });
    }
    teacherIds[t.email] = { id: tp.id, userId: u.id, trialId: trial.id, paidId: paid.id, tz: t.tz };
  }

  // Past demo lessons (completed) with demo reviews, so reputation UI has labelled sample data.
  const reviewTexts = ["Clear explanations and well-prepared exercises. (Demo review)", "Very patient, I finally understood the topic. (Demo review)", "Great structure and useful homework. (Demo review)", "Friendly and precise feedback. (Demo review)"];
  let k = 0;
  for (const [email, info] of Object.entries(teacherIds)) {
    if (email === "pierre.demo@classbridge.test") continue;
    for (const [j, st] of [student, student2].entries()) {
      const start = now.minus({ days: 7 + j * 3 + k }).set({ hour: 9 + j, minute: 0, second: 0, millisecond: 0 });
      const [o] = await db.select().from(s.lessonOfferings).where(eq(s.lessonOfferings.id, info.paidId));
      const [b] = await db.insert(s.bookings).values({
        studentId: st.id, teacherId: info.id, offeringId: info.paidId, startsAt: start.toJSDate(), endsAt: start.plus({ minutes: 60 }).toJSDate(),
        studentTimezone: "Africa/Tunis", mode: "online", status: "completed", paymentStatus: "not_required", attendanceStatus: "present",
        priceMinor: o.priceMinor, currency: o.currency, platformFeeMinor: platformFee(o.priceMinor, 1500), cancellationPolicy: o.cancellationPolicy, roomName: room(), isDemo: true,
      }).returning();
      await db.insert(s.bookingEvents).values([
        { bookingId: b.id, fromStatus: "draft", toStatus: "slot_held", actorRole: "system", reason: "demo_seed" },
        { bookingId: b.id, fromStatus: "slot_held", toStatus: "confirmed", actorRole: "system", reason: "demo_seed (no real payment)" },
        { bookingId: b.id, fromStatus: "confirmed", toStatus: "completed", actorRole: "system", reason: "demo_seed" },
      ]);
      await db.insert(s.attendanceRecords).values({ bookingId: b.id, participantId: st.id, status: "present", markedBy: info.userId });
      await db.insert(s.lessonNotes).values({ bookingId: b.id, authorId: info.userId, body: "Demo lesson note: reviewed the main concepts and assigned three practice exercises." });
      await db.insert(s.reviews).values({ bookingId: b.id, studentId: st.id, teacherId: info.id, rating: 4 + ((k + j) % 2), body: reviewTexts[(k + j) % reviewTexts.length], isDemo: true, editableUntil: now.plus({ days: 7 }).toJSDate() });
    }
    k++;
  }

  // An upcoming confirmed FREE demo lesson for the demo student (so "My lessons" and the classroom page have data).
  const amira = teacherIds["amira.demo@classbridge.test"];
  const nextWeekday = now.setZone(amira.tz).plus({ days: 2 }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  const wd = nextWeekday.weekday > 5 ? nextWeekday.plus({ days: 8 - nextWeekday.weekday }) : nextWeekday;
  const [up] = await db.insert(s.bookings).values({
    studentId: student.id, teacherId: amira.id, offeringId: amira.trialId, startsAt: wd.toUTC().toJSDate(), endsAt: wd.plus({ minutes: 30 }).toUTC().toJSDate(),
    studentTimezone: "Africa/Tunis", mode: "online", status: "confirmed", paymentStatus: "not_required", priceMinor: 0, currency: "TND", platformFeeMinor: 0,
    cancellationPolicy: "flex-24h-v1", roomName: room(), isDemo: true,
  }).returning();
  await db.insert(s.bookingEvents).values([
    { bookingId: up.id, fromStatus: "draft", toStatus: "slot_held", actorRole: "system", reason: "demo_seed" },
    { bookingId: up.id, fromStatus: "slot_held", toStatus: "confirmed", actorRole: "system", reason: "demo_seed free_booking" },
  ]);

  // Demo course with sections, lessons and a quiz.
  const sara = teacherIds["sara.demo@classbridge.test"];
  const [course] = await db.insert(s.courses).values({
    teacherId: sara.id, subjectId: subjRows.find((x) => x.slug === "python")!.id, slug: "python-basics-demo", title: "Python basics (Demo course)",
    summary: "A short demo course: variables, control flow and functions, with a final quiz.", objectives: "Write small Python programs using variables, if/else, loops and functions.",
    prerequisites: "None.", level: "beginner", language: "en", priceMinor: 0, currency: "GBP", status: "published", isDemo: true, publishedAt: now.toJSDate(),
  }).returning();
  const [sec1] = await db.insert(s.courseSections).values({ courseId: course.id, title: "Getting started", position: 1 }).returning();
  const [sec2] = await db.insert(s.courseSections).values({ courseId: course.id, title: "Logic and functions", position: 2 }).returning();
  await db.insert(s.courseLessons).values([
    { sectionId: sec1.id, courseId: course.id, title: "Variables and types", type: "text", position: 1, isPreview: true, durationMinutes: 8, content: "A variable stores a value: x = 3. Python has int, float, str and bool. Use type(x) to inspect a value's type." },
    { sectionId: sec1.id, courseId: course.id, title: "Printing and input", type: "text", position: 2, durationMinutes: 6, content: "print('Hello') writes to the screen. input() reads a line of text from the user as a string." },
    { sectionId: sec2.id, courseId: course.id, title: "if / else and loops", type: "text", position: 3, durationMinutes: 10, content: "if x > 0: ... else: ... chooses a branch. for i in range(3): repeats a block. while cond: repeats while a condition holds." },
  ]);
  const [quizLesson] = await db.insert(s.courseLessons).values({ sectionId: sec2.id, courseId: course.id, title: "Final quiz", type: "quiz", position: 4, durationMinutes: 5 }).returning();
  const [quiz] = await db.insert(s.quizzes).values({ lessonId: quizLesson.id, maxAttempts: 3, passingScorePct: 70 }).returning();
  const qs: Array<[string, Array<[string, boolean]>, string]> = [
    ["Which value is a string?", [["3", false], ["'3'", true], ["3.0", false]], "Quotes make a string literal."],
    ["What does range(3) produce in a for loop?", [["1, 2, 3", false], ["0, 1, 2", true], ["0, 1, 2, 3", false]], "range(n) starts at 0 and stops before n."],
    ["Which keyword defines a function?", [["func", false], ["def", true], ["function", false]], "Functions are defined with def name(args):"],
  ];
  for (const [pi, [prompt, opts, expl]] of qs.entries()) {
    const [q] = await db.insert(s.quizQuestions).values({ quizId: quiz.id, prompt, explanation: expl, position: pi + 1 }).returning();
    await db.insert(s.questionOptions).values(opts.map(([label, isCorrect], oi) => ({ questionId: q.id, label, isCorrect, position: oi + 1 })));
  }

  await db.insert(s.featureFlags).values([
    { key: "ai_features", enabled: false, description: "Optional AI assistants (off by default; no provider configured)" },
    { key: "group_lessons", enabled: false, description: "Group lesson booking (not implemented in this build)" },
  ]);
  await db.insert(s.auditLog).values({ actorId: admin.id, action: "seed.demo_data_loaded", targetType: "system", reason: "Development seed", metadata: { teachers: TEACHERS.length } });

  console.log(`Seed complete. Demo accounts (password "${DEMO_PASSWORD}", development only):`);
  console.log("  admin@classbridge.test (admin), support@classbridge.test (support), student@classbridge.test, student2@classbridge.test");
  console.log("  teachers: " + TEACHERS.map((t) => t.email).join(", "));
  await pool.end();
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
