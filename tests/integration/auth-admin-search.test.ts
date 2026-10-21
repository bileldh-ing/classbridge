import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb } from "@/lib/db";
import { authTokens, auditLog, emailOutbox, teacherLocations, teacherProfiles, users, consentRecords, userRoles } from "@/lib/db/schema";
import { getSessionUser, login, requestPasswordReset, resetPassword, signup, verifyEmail, revokeAllSessions } from "@/lib/auth/core";
import { decideTeacherProfile, setUserStatus, adminMetrics } from "@/lib/services/admin";
import { searchTeachers } from "@/lib/services/teacher-search";
import { becomeTeacher } from "@/lib/services/teachers";
import { teacherSearchSchema } from "@/lib/validation/search";
import { db, linkSubject, makeSubject, makeTeacher, makeUser, resetDb } from "../helpers";
import { openConversationForBooking, getMessages, sendMessage, setBlocked } from "@/lib/services/messaging";
import { confirmFreeBooking, createBooking } from "@/lib/services/bookings";
import { futureHour } from "../helpers";

beforeEach(resetDb);
afterAll(closeDb);

const signupInput = (email: string) => ({ displayName: "Lina", email, password: "correct horse 42", timezone: "Africa/Tunis", locale: "fr" as const, acceptTerms: true as const, confirmAdult: true as const, marketingOptIn: false });

describe("auth lifecycle (argon2id + DB sessions)", () => {
  it("signup → verify email → login → session → reset password revokes sessions", async () => {
    const { userId } = await signup(db(), signupInput("lina@example.test"));
    const consents = await db().select().from(consentRecords).where(eq(consentRecords.userId, userId));
    expect(consents.map((c) => `${c.consentType}:${c.value}`).sort()).toEqual(["marketing:false", "privacy:true", "terms:true"]);
    const [u] = await db().select().from(users).where(eq(users.id, userId));
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    // verification email queued with a token whose hash (not the token) is stored
    const [mail] = await db().select().from(emailOutbox).where(eq(emailOutbox.template, "verify_email"));
    const token = decodeURIComponent(mail.body.match(/token=([^\s]+)/)![1]);
    const [tok] = await db().select().from(authTokens);
    expect(tok.tokenHash).not.toBe(token);
    await verifyEmail(db(), token);
    await expect(verifyEmail(db(), token)).rejects.toMatchObject({ code: "NOT_ELIGIBLE" }); // single use

    await expect(login(db(), "lina@example.test", "wrong password 1")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(login(db(), "nobody@example.test", "whatever 123")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const s = await login(db(), "LINA@example.test", "correct horse 42");
    const su = await getSessionUser(db(), s.token);
    expect(su).toMatchObject({ email: "lina@example.test", emailVerified: true, roles: ["student"], timezone: "Africa/Tunis" });
    expect(await getSessionUser(db(), "forged-token")).toBeNull();

    await requestPasswordReset(db(), "lina@example.test");
    const [resetMail] = await db().select().from(emailOutbox).where(eq(emailOutbox.template, "reset_password"));
    const rt = decodeURIComponent(resetMail.body.match(/token=([^\s]+)/)![1]);
    await resetPassword(db(), rt, "brand new pass 77");
    expect(await getSessionUser(db(), s.token)).toBeNull();
    await expect(login(db(), "lina@example.test", "correct horse 42")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await login(db(), "lina@example.test", "brand new pass 77");
  });

  it("rejects duplicate emails case-insensitively and blocks suspended accounts", async () => {
    await signup(db(), signupInput("dup@example.test"));
    await expect(signup(db(), signupInput("DUP@example.test"))).rejects.toMatchObject({ code: "CONFLICT" });
    const admin = await makeUser(["admin"]);
    const [u] = await db().select().from(users).where(eq(users.email, "dup@example.test"));
    const s = await login(db(), "dup@example.test", "correct horse 42");
    await setUserStatus(db(), admin, u.id, { status: "suspended", reason: "abuse report #1" });
    expect(await getSessionUser(db(), s.token)).toBeNull();
    await expect(login(db(), "dup@example.test", "correct horse 42")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("role upgrade keeps a single identity", async () => {
    const { userId } = await signup(db(), signupInput("up@example.test"));
    await becomeTeacher(db(), userId);
    await becomeTeacher(db(), userId);
    const roles = await db().select().from(userRoles).where(eq(userRoles.userId, userId));
    expect(roles.map((r) => r.role).sort()).toEqual(["student", "teacher"]);
    expect(await db().select().from(teacherProfiles)).toHaveLength(1);
    await revokeAllSessions(db(), userId);
  });
});

describe("admin verification is permission-gated and audited", () => {
  it("non-admins are refused; approval publishes and writes an immutable audit record", async () => {
    const t = await makeTeacher();
    await db().update(teacherProfiles).set({ publishState: "pending_review" }).where(eq(teacherProfiles.id, t.teacher.id));
    const student = await makeUser(["student"]);
    const support = await makeUser(["support"]);
    await expect(decideTeacherProfile(db(), student, t.teacher.id, { decision: "approve", reason: "looks good" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideTeacherProfile(db(), support, t.teacher.id, { decision: "approve", reason: "looks good" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = await makeUser(["admin"]);
    await decideTeacherProfile(db(), admin, t.teacher.id, { decision: "approve", reason: "Identity and bio reviewed" });
    const [tp] = await db().select().from(teacherProfiles).where(eq(teacherProfiles.id, t.teacher.id));
    expect(tp.publishState).toBe("published");
    const [a] = await db().select().from(auditLog).where(eq(auditLog.action, "teacher.profile_approved"));
    expect(a).toMatchObject({ actorId: admin.id, targetId: t.teacher.id, reason: "Identity and bio reviewed" });
    await expect(db().execute(sql`DELETE FROM audit_log`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
    await expect(adminMetrics(db(), student)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await adminMetrics(db(), admin)).published_teachers).toBe(1);
  });
});

describe("teacher search honours filters and location privacy", () => {
  it("filters server-side, paginates, excludes drafts, and never returns private positions", async () => {
    const maths = await makeSubject("mathematics");
    const a = await makeTeacher({ mode: "in_person" });
    const b = await makeTeacher({ mode: "in_person" });
    const draft = await makeTeacher();
    await db().update(teacherProfiles).set({ publishState: "draft" }).where(eq(teacherProfiles.id, draft.teacher.id));
    await db().update(teacherProfiles).set({ hourlyRateMinor: 5000, languages: ["fr"] }).where(eq(teacherProfiles.id, b.teacher.id));
    await linkSubject(a.teacher.id, maths.id);
    // Tunis centre (approximate) vs a private location
    await db().insert(teacherLocations).values({ teacherId: a.teacher.id, city: "Tunis", country: "TN", approxLat: 36.81, approxLng: 10.19, preciseLat: 36.8065, preciseLng: 10.1815, visibility: "approximate", source: "test" });
    await db().insert(teacherLocations).values({ teacherId: b.teacher.id, city: "Tunis", country: "TN", approxLat: 36.81, approxLng: 10.19, visibility: "private", source: "test" });

    const all = await searchTeachers(db(), teacherSearchSchema.parse({}));
    expect(all.total).toBe(2);
    expect(all.items.map((i) => i.id)).not.toContain(draft.teacher.id);
    expect(JSON.stringify(all)).not.toContain("36.8065"); // precise coordinate never leaves the DB

    const bySubject = await searchTeachers(db(), teacherSearchSchema.parse({ subject: "mathematics" }));
    expect(bySubject.items.map((i) => i.id)).toEqual([a.teacher.id]);
    const byPrice = await searchTeachers(db(), teacherSearchSchema.parse({ minPrice: "40", currency: "EUR" }));
    expect(byPrice.items.map((i) => i.id)).toEqual([b.teacher.id]);
    const byLang = await searchTeachers(db(), teacherSearchSchema.parse({ language: "fr" }));
    expect(byLang.items.map((i) => i.id)).toEqual([b.teacher.id]);

    const near = await searchTeachers(db(), teacherSearchSchema.parse({ lat: "36.8", lng: "10.18", radiusKm: "10", mode: "in_person" }));
    expect(near.items.map((i) => i.id)).toEqual([a.teacher.id]); // private one excluded from radius search
    expect(near.items[0].position).toEqual({ lat: 36.81, lng: 10.19 });
    expect(near.items[0].distanceKm).toBeLessThanOrEqual(2);
    const far = await searchTeachers(db(), teacherSearchSchema.parse({ lat: "48.85", lng: "2.35", radiusKm: "50" }));
    expect(far.total).toBe(0);
    const privateCard = all.items.find((i) => i.id === b.teacher.id)!;
    expect(privateCard.position).toBeNull();

    const page = await searchTeachers(db(), teacherSearchSchema.parse({ pageSize: "1", page: "2" }));
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    const text = await searchTeachers(db(), teacherSearchSchema.parse({ q: "maths" }));
    expect(text.total).toBe(2);
  });
});

describe("messaging access control", () => {
  it("only conversation members can read/send; blocking stops sending", async () => {
    const t = await makeTeacher({ priceMinor: 0 });
    const s = await makeUser();
    const b = await createBooking(db(), s, { offeringId: t.offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await confirmFreeBooking(db(), s, b.id);
    const c = await openConversationForBooking(db(), s, b.id);
    await sendMessage(db(), s, c.id, "Hello, what should I prepare?");
    await sendMessage(db(), t.user, c.id, "Bring your last exam.");
    const intruder = await makeUser();
    await expect(getMessages(db(), intruder, c.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(sendMessage(db(), intruder, c.id, "spam")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(openConversationForBooking(db(), intruder, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getMessages(db(), t.user, c.id)).map((m) => m.body)).toEqual(["Hello, what should I prepare?", "Bring your last exam."]);
    await setBlocked(db(), t.user, c.id, true);
    await expect(sendMessage(db(), s, c.id, "hello?")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
