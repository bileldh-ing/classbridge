/** Privileged operations. Every function re-checks permissions and writes an audit record with a reason. */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db";
import { auditLog, profiles, teacherBadges, teacherCredentials, teacherProfiles, userReports, users, reviews } from "../db/schema";
import { AppError } from "../errors";
import { can, type Principal } from "../auth/permissions";
import { audit } from "./audit";
import { notify } from "./notify";
import { enqueueEmail } from "../email/outbox";
import { revokeAllSessions } from "../auth/core";
import { env } from "../env";

function need(actor: Principal, perm: Parameters<typeof can>[1]) {
  if (!can(actor, perm)) throw new AppError("FORBIDDEN", "You do not have permission to do this.");
}
const reason = z.string().trim().min(5, "reason_required").max(1000);

export const teacherDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]), reason });
export async function decideTeacherProfile(db: DB, actor: Principal, teacherId: string, input: z.infer<typeof teacherDecisionSchema>) {
  need(actor, "admin.verify_teachers");
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(teacherProfiles).where(eq(teacherProfiles.id, teacherId)).for("update");
    if (!t) throw new AppError("NOT_FOUND", "Teacher not found");
    if (t.publishState !== "pending_review") throw new AppError("INVALID_TRANSITION", `Profile is ${t.publishState}, not pending review.`);
    const approve = input.decision === "approve";
    await tx.update(teacherProfiles).set({ publishState: approve ? "published" : "rejected", reviewNote: input.reason, publishedAt: approve ? new Date() : null, updatedAt: new Date() }).where(eq(teacherProfiles.id, teacherId));
    await audit(tx, { actorId: actor.id, action: approve ? "teacher.profile_approved" : "teacher.profile_rejected", targetType: "teacher_profile", targetId: teacherId, reason: input.reason });
    await notify(tx, { userId: t.userId, kind: "teacher_review", title: approve ? "Your profile is live" : "Profile changes requested", body: input.reason, link: "/teach", dedupeKey: `teacher_review:${teacherId}:${Date.now()}` });
    const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, t.userId));
    await enqueueEmail(tx, { to: u.email, userId: t.userId, template: "teacher_review", subject: approve ? "Your ClassBridge teacher profile is published" : "Your ClassBridge teacher profile needs changes",
      body: `${approve ? "Your profile was approved and is now visible to students." : "Your profile was not approved yet."}\nReviewer note: ${input.reason}\n${env().APP_URL}/teach`, idempotencyKey: `teacher_review:${teacherId}:${Date.now()}` });
  });
}

export const credentialDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]), reason });
/** Approving a credential grants the `credential_reviewed` badge — only through this explicit, audited action. */
export async function decideCredential(db: DB, actor: Principal, credentialId: string, input: z.infer<typeof credentialDecisionSchema>) {
  need(actor, "admin.verify_teachers");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(teacherCredentials).where(eq(teacherCredentials.id, credentialId)).for("update");
    if (!c) throw new AppError("NOT_FOUND", "Credential not found");
    const approve = input.decision === "approve";
    await tx.update(teacherCredentials).set({ status: approve ? "approved" : "rejected", reviewerId: actor.id, reviewNote: input.reason, reviewedAt: new Date() }).where(eq(teacherCredentials.id, credentialId));
    if (approve) {
      const [has] = await tx.select({ id: teacherBadges.id }).from(teacherBadges).where(and(eq(teacherBadges.teacherId, c.teacherId), eq(teacherBadges.badge, "credential_reviewed"), isNull(teacherBadges.revokedAt)));
      if (!has) await tx.insert(teacherBadges).values({ teacherId: c.teacherId, badge: "credential_reviewed", grantedBy: actor.id, reason: `Credential "${c.title}" reviewed: ${input.reason}` });
    }
    await audit(tx, { actorId: actor.id, action: approve ? "credential.approved" : "credential.rejected", targetType: "teacher_credential", targetId: credentialId, reason: input.reason, metadata: { teacherId: c.teacherId } });
  });
}

export const badgeSchema = z.object({ badge: z.enum(["identity_verified", "platform_verified"]), action: z.enum(["grant", "revoke"]), reason });
export async function setBadge(db: DB, actor: Principal, teacherId: string, input: z.infer<typeof badgeSchema>) {
  need(actor, "admin.verify_teachers");
  await db.transaction(async (tx) => {
    if (input.action === "grant") {
      const [has] = await tx.select({ id: teacherBadges.id }).from(teacherBadges).where(and(eq(teacherBadges.teacherId, teacherId), eq(teacherBadges.badge, input.badge), isNull(teacherBadges.revokedAt)));
      if (has) throw new AppError("CONFLICT", "Badge already active");
      await tx.insert(teacherBadges).values({ teacherId, badge: input.badge, grantedBy: actor.id, reason: input.reason });
    } else {
      await tx.update(teacherBadges).set({ revokedAt: new Date() }).where(and(eq(teacherBadges.teacherId, teacherId), eq(teacherBadges.badge, input.badge), isNull(teacherBadges.revokedAt)));
    }
    await audit(tx, { actorId: actor.id, action: `badge.${input.action}`, targetType: "teacher_profile", targetId: teacherId, reason: input.reason, metadata: { badge: input.badge } });
  });
}

export const userStatusSchema = z.object({ status: z.enum(["active", "suspended"]), reason });
export async function setUserStatus(db: DB, actor: Principal, userId: string, input: z.infer<typeof userStatusSchema>) {
  need(actor, "admin.manage_users");
  if (userId === actor.id) throw new AppError("NOT_ELIGIBLE", "You cannot change your own account status.");
  await db.transaction(async (tx) => {
    const [u] = await tx.update(users).set({ status: input.status, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
    if (!u) throw new AppError("NOT_FOUND", "User not found");
    if (input.status === "suspended") await revokeAllSessions(tx, userId);
    await audit(tx, { actorId: actor.id, action: `user.${input.status === "suspended" ? "suspended" : "reactivated"}`, targetType: "user", targetId: userId, reason: input.reason });
  });
}

export const reportDecisionSchema = z.object({ status: z.enum(["reviewing", "actioned", "dismissed"]), note: reason, hideReview: z.boolean().default(false) });
export async function decideReport(db: DB, actor: Principal, reportId: string, input: z.infer<typeof reportDecisionSchema>) {
  need(actor, "admin.manage_reports");
  await db.transaction(async (tx) => {
    const [r] = await tx.update(userReports).set({ status: input.status, resolutionNote: input.note }).where(eq(userReports.id, reportId)).returning();
    if (!r) throw new AppError("NOT_FOUND", "Report not found");
    if (input.hideReview && input.status === "actioned" && r.targetType === "review") await tx.update(reviews).set({ status: "hidden" }).where(eq(reviews.id, r.targetId));
    await audit(tx, { actorId: actor.id, action: `report.${input.status}`, targetType: "user_report", targetId: reportId, reason: input.note, metadata: { hideReview: input.hideReview } });
  });
}

export async function adminMetrics(db: DB, actor: Principal) {
  need(actor, "admin.view_dashboard");
  const r = await db.execute<Record<string, string>>(sql`SELECT
    (SELECT count(*) FROM users WHERE status <> 'deleted') AS users,
    (SELECT count(*) FROM user_roles WHERE role = 'student') AS students,
    (SELECT count(*) FROM user_roles WHERE role = 'teacher') AS teachers,
    (SELECT count(*) FROM teacher_profiles WHERE publish_state = 'pending_review') AS pending_teachers,
    (SELECT count(*) FROM teacher_profiles WHERE publish_state = 'published') AS published_teachers,
    (SELECT count(*) FROM teacher_credentials WHERE status = 'submitted') AS pending_credentials,
    (SELECT count(*) FROM bookings WHERE status IN ('confirmed','in_progress')) AS upcoming_bookings,
    (SELECT count(*) FROM bookings WHERE status = 'completed') AS completed_bookings,
    (SELECT count(*) FROM provider_webhook_events WHERE status = 'failed') AS failed_webhooks,
    (SELECT count(*) FROM refunds WHERE status IN ('requested','failed','pending')) AS open_refunds,
    (SELECT count(*) FROM user_reports WHERE status IN ('open','reviewing')) AS open_reports,
    (SELECT count(*) FROM courses WHERE status = 'published') AS published_courses,
    (SELECT count(*) FROM users WHERE is_demo) AS demo_users`);
  return Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
}

export async function recentAudit(db: DB, actor: Principal, limit = 100) {
  need(actor, "admin.view_audit");
  return db.select({ a: auditLog, actorName: profiles.displayName }).from(auditLog).leftJoin(profiles, eq(profiles.userId, auditLog.actorId)).orderBy(desc(auditLog.createdAt)).limit(limit);
}
