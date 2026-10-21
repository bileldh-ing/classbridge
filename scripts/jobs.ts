/**
 * Background job runner (run via cron / a process manager, e.g. every minute: `pnpm jobs:run`).
 * Long-running work never happens inside request handlers. Pass --loop to run continuously.
 *  - expire stale slot holds
 *  - deliver queued emails (retry with backoff, idempotent by key)
 *  - lesson reminders (24 h and 1 h before start), de-duplicated per booking
 */
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { loadEnvFile } from "./load-env";
loadEnvFile();
const { getDb, closeDb } = await import("../src/lib/db");
const { expireStaleHolds } = await import("../src/lib/services/bookings");
const { deliverPendingEmails, enqueueEmail } = await import("../src/lib/email/outbox");
const { notify } = await import("../src/lib/services/notify");
const s = await import("../src/lib/db/schema");

async function reminders() {
  const db = getDb();
  const now = Date.now();
  let n = 0;
  for (const [label, ms] of [["24h", 24 * 3600_000], ["1h", 3600_000]] as const) {
    const rows = await db.select({ b: s.bookings, email: s.users.email, teacherUserId: s.teacherProfiles.userId }).from(s.bookings)
      .innerJoin(s.users, eq(s.users.id, s.bookings.studentId)).innerJoin(s.teacherProfiles, eq(s.teacherProfiles.id, s.bookings.teacherId))
      .where(and(inArray(s.bookings.status, ["confirmed"]), gte(s.bookings.startsAt, new Date(now + ms - 5 * 60_000)), lte(s.bookings.startsAt, new Date(now + ms + 5 * 60_000))));
    for (const r of rows) {
      for (const uid of [r.b.studentId, r.teacherUserId]) {
        await notify(db, { userId: uid, kind: "reminder", title: `Lesson in ${label === "24h" ? "24 hours" : "1 hour"}`, body: "Open the lesson page to join when the classroom opens.", link: uid === r.b.studentId ? `/lessons/${r.b.id}` : `/teach/bookings/${r.b.id}`, dedupeKey: `reminder:${label}:${r.b.id}` });
      }
      await enqueueEmail(db, { to: r.email, userId: r.b.studentId, template: "reminder", subject: `Your ClassBridge lesson starts in ${label}`, body: `Reminder: your lesson starts in ${label}. ${process.env.APP_URL}/lessons/${r.b.id}`, idempotencyKey: `reminder:${label}:${r.b.id}` });
      n++;
    }
  }
  return n;
}

async function tick() {
  const db = getDb();
  const expired = await expireStaleHolds(db);
  const rem = await reminders();
  const mail = await deliverPendingEmails(db);
  console.log(JSON.stringify({ job: "tick", expiredHolds: expired, reminders: rem, emailsProcessed: mail.processed, emailsSent: mail.sent }));
}

if (process.argv.includes("--loop")) {
  for (;;) { await tick().catch((e) => console.error(e)); await new Promise((r) => setTimeout(r, 60_000)); }
} else {
  await tick();
  await closeDb();
}
