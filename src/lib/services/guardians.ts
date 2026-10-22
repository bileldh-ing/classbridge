/**
 * Parent/guardian links (behind the `guardian_links` flag). A guardian asks to link to a learner's account by email;
 * nothing is shared until the LEARNER signs in and gives explicit consent (recorded in consent_records with the policy
 * version). Guardians get read-only, limited permissions: lesson times + status, and course progress.
 * They never see messages, payments, notes or contact details, and either side can revoke at any time.
 * Accounts for minors remain gated behind the separate `minor_accounts` flag (OFF), so signup stays 18+.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DbOrTx } from "../db";
import { bookings, consentRecords, courseEnrollments, courses, guardianLinks, lessonOfferings, lessonProgress, courseLessons, profiles, teacherProfiles, users } from "../db/schema";
import { AppError, pgCode, PG_UNIQUE_VIOLATION } from "../errors";
import type { Principal } from "../auth/permissions";
import { requireFlag } from "./flags";
import { randomToken, sha256 } from "../crypto";
import { notify } from "./notify";
import { enqueueEmail } from "../email/outbox";
import { env } from "../env";
import { rateLimit } from "./rate-limit";
import { audit } from "./audit";

export const GUARDIAN_POLICY_VERSION = "guardian-2026-10-22";
export const linkRequestSchema = z.object({ learnerEmail: z.string().trim().toLowerCase().email().max(254), canViewBookings: z.boolean().default(true), canViewProgress: z.boolean().default(true) });
export const consentSchema = z.object({ token: z.string().min(20).max(200), decision: z.enum(["accept", "decline"]) });

export async function requestGuardianLink(db: DB, guardian: Principal, input: z.infer<typeof linkRequestSchema>) {
  await requireFlag(db, "guardian_links", "Guardian accounts");
  const rl = await rateLimit(db, `guardian-link:${guardian.id}`, 5, 3600);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many link requests. Try again later.");
  const [me] = await db.select({ email: users.email, name: profiles.displayName }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, guardian.id));
  if (me.email.toLowerCase() === input.learnerEmail) throw new AppError("VALIDATION_FAILED", "You cannot link to your own account.");
  const token = randomToken();
  try {
    const [link] = await db.insert(guardianLinks).values({ guardianId: guardian.id, learnerEmail: input.learnerEmail, canViewBookings: input.canViewBookings, canViewProgress: input.canViewProgress, consentTokenHash: sha256(token) }).returning();
    const url = `${env().APP_URL}/guardian/consent?token=${encodeURIComponent(token)}`;
    const [learner] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.learnerEmail}`);
    if (learner) await notify(db, { userId: learner.id, kind: "guardian_request", title: `${me.name} asked to follow your learning`, body: "Review the request: nothing is shared unless you accept.", link: `/guardian/consent?token=${encodeURIComponent(token)}`, dedupeKey: `guardian_request:${link.id}` });
    // Same message whether or not an account exists for the address (no account enumeration).
    await enqueueEmail(db, { to: input.learnerEmail, userId: learner?.id ?? null, template: "guardian_request", subject: `${me.name} asked to follow your learning on ClassBridge`,
      body: `${me.name} would like read-only access to your lesson schedule and course progress on ClassBridge.\nNothing is shared unless you sign in and accept:\n${url}\n\nYou can revoke access at any time in Family access.`, idempotencyKey: `guardian_request:${link.id}` });
    return { id: link.id, token };
  } catch (e) {
    if (pgCode(e) === PG_UNIQUE_VIOLATION) throw new AppError("CONFLICT", "You already have a pending or active link with this learner.");
    throw e;
  }
}

export async function respondToGuardianLink(db: DB, learner: Principal, input: z.infer<typeof consentSchema>) {
  await requireFlag(db, "guardian_links", "Guardian accounts");
  return db.transaction(async (tx) => {
    const [link] = await tx.select().from(guardianLinks).where(eq(guardianLinks.consentTokenHash, sha256(input.token))).for("update");
    const [me] = await tx.select({ email: users.email }).from(users).where(eq(users.id, learner.id));
    if (!link || link.status !== "pending" || link.learnerEmail.toLowerCase() !== me.email.toLowerCase()) throw new AppError("NOT_FOUND", "This request is invalid, expired or addressed to another account.");
    const accept = input.decision === "accept";
    await tx.update(guardianLinks).set({
      status: accept ? "active" : "declined", learnerId: learner.id, consentTokenHash: null,
      consentedAt: accept ? new Date() : null, consentPolicyVersion: accept ? GUARDIAN_POLICY_VERSION : null,
    }).where(eq(guardianLinks.id, link.id));
    await tx.insert(consentRecords).values({ userId: learner.id, consentType: "guardian_link", policyVersion: GUARDIAN_POLICY_VERSION, value: accept, source: `guardian_link:${link.id}` });
    await audit(tx, { actorId: learner.id, action: accept ? "guardian.link_accepted" : "guardian.link_declined", targetType: "guardian_link", targetId: link.id });
    await notify(tx, { userId: link.guardianId, kind: "guardian_response", title: accept ? "Your guardian link was accepted" : "Your guardian link was declined", link: "/guardian", dedupeKey: `guardian_response:${link.id}` });
    return { status: accept ? "active" : "declined" };
  });
}

export async function revokeGuardianLink(db: DB, actor: Principal, linkId: string) {
  return db.transaction(async (tx) => {
    const [link] = await tx.select().from(guardianLinks).where(eq(guardianLinks.id, linkId)).for("update");
    if (!link || (link.guardianId !== actor.id && link.learnerId !== actor.id)) throw new AppError("NOT_FOUND", "Link not found.");
    if (!["pending", "active"].includes(link.status)) return { status: link.status };
    await tx.update(guardianLinks).set({ status: "revoked", revokedAt: new Date(), consentTokenHash: null }).where(eq(guardianLinks.id, link.id));
    if (link.learnerId) await tx.insert(consentRecords).values({ userId: link.learnerId, consentType: "guardian_link_revoked", policyVersion: GUARDIAN_POLICY_VERSION, value: false, source: `revoked_by:${actor.id === link.guardianId ? "guardian" : "learner"}:${link.id}` });
    await audit(tx, { actorId: actor.id, action: "guardian.link_revoked", targetType: "guardian_link", targetId: link.id });
    return { status: "revoked" };
  });
}

export async function listGuardianLinks(db: DbOrTx, actor: Principal) {
  const rows = await db.select({ l: guardianLinks, guardianName: profiles.displayName }).from(guardianLinks)
    .innerJoin(profiles, eq(profiles.userId, guardianLinks.guardianId))
    .where(or(eq(guardianLinks.guardianId, actor.id), eq(guardianLinks.learnerId, actor.id))).orderBy(desc(guardianLinks.createdAt));
  const learnerIds = rows.map((r) => r.l.learnerId).filter((x): x is string => !!x);
  const names = learnerIds.length ? await db.select({ id: profiles.userId, name: profiles.displayName }).from(profiles).where(inArray(profiles.userId, learnerIds)) : [];
  return rows.map(({ l, guardianName }) => ({
    id: l.id, status: l.status, role: l.guardianId === actor.id ? ("guardian" as const) : ("learner" as const),
    guardianName, learnerName: names.find((n) => n.id === l.learnerId)?.name ?? null, learnerEmail: l.guardianId === actor.id ? l.learnerEmail : undefined,
    canViewBookings: l.canViewBookings, canViewProgress: l.canViewProgress, createdAt: l.createdAt, consentedAt: l.consentedAt,
  }));
}

/** Read-only, permission-limited view for an ACTIVE link. */
export async function guardianOverview(db: DbOrTx, guardian: Principal, linkId: string) {
  const [link] = await db.select().from(guardianLinks).where(and(eq(guardianLinks.id, linkId), eq(guardianLinks.guardianId, guardian.id)));
  if (!link || link.status !== "active" || !link.learnerId) throw new AppError("NOT_FOUND", "Link not found or not active.");
  const learnerId = link.learnerId;
  const [learner] = await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, learnerId));
  const lessons = link.canViewBookings ? await db.select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt, status: bookings.status, title: lessonOfferings.title, teacherName: profiles.displayName })
    .from(bookings).innerJoin(lessonOfferings, eq(lessonOfferings.id, bookings.offeringId)).innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId))
    .innerJoin(profiles, eq(profiles.userId, teacherProfiles.userId))
    .where(and(eq(bookings.studentId, learnerId), inArray(bookings.status, ["confirmed", "in_progress", "completed", "no_show_student", "canceled_by_student", "canceled_by_teacher"])))
    .orderBy(desc(bookings.startsAt)).limit(50) : null;
  const progress = link.canViewProgress ? await db.select({
    title: courses.title, completedAt: courseEnrollments.completedAt,
    done: sql<number>`(SELECT count(*)::int FROM ${lessonProgress} lp WHERE lp.course_id = ${courses.id} AND lp.user_id = ${learnerId})`,
    total: sql<number>`(SELECT count(*)::int FROM ${courseLessons} cl WHERE cl.course_id = ${courses.id})`,
  }).from(courseEnrollments).innerJoin(courses, eq(courses.id, courseEnrollments.courseId)).where(eq(courseEnrollments.userId, learnerId)) : null;
  return { learnerName: learner?.name ?? "Learner", permissions: { bookings: link.canViewBookings, progress: link.canViewProgress }, lessons, progress };
}
