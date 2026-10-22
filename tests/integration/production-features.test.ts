import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { closeDb } from "@/lib/db";
import { auditLog, bookingEvents, bookings, consentRecords, courseEnrollments, featureFlags, lessonOfferings, notifications, submissionGrades } from "@/lib/db/schema";
import { confirmFreeBooking, createBooking } from "@/lib/services/bookings";
import { rescheduleBooking } from "@/lib/services/reschedule";
import { bookGroupSeat, createGroupSession, listGroupSessions } from "@/lib/services/group-lessons";
import { createTicket, getTicket, replyToTicket, supportQueue, updateTicket } from "@/lib/services/support";
import { setFlag, isEnabled } from "@/lib/services/flags";
import { listTaxonomy, moderateCourse, moderateTeacher, upsertCategory, upsertSubject } from "@/lib/services/moderation";
import { guardianOverview, listGuardianLinks, requestGuardianLink, respondToGuardianLink, revokeGuardianLink } from "@/lib/services/guardians";
import { createAssignment, gradeSubmission, gradingHistory, listAnnouncements, listAssignments, listBookmarks, postAnnouncement, saveNote, getNote, setBookmark, submitAssignment } from "@/lib/services/lms-extra";
import { addLesson, addSection, createCourse, enrollFree, setCourseStatus } from "@/lib/services/courses";
import { getAttachmentForMember, openConversationForBooking, sendAttachment } from "@/lib/services/messaging";
import { beginTotpSetup, enableTotp, verifySessionTotp } from "@/lib/services/mfa";
import { createSession, getSessionUser } from "@/lib/auth/core";
import { totp } from "@/lib/auth/totp";
import { computeSlots } from "@/lib/services/teachers";
import { db, futureHour, makeTeacher, makeUser, resetDb } from "../helpers";
import { isAppError } from "@/lib/errors";

beforeEach(resetDb);
afterAll(closeDb);

async function flag(key: string, enabled = true) {
  await db().insert(featureFlags).values({ key, enabled, description: key }).onConflictDoUpdate({ target: featureFlags.key, set: { enabled } });
}

async function confirmedBooking(hoursAhead = 72) {
  const t = await makeTeacher({ priceMinor: 0 });
  const s = await makeUser();
  const b = await createBooking(db(), s, { offeringId: t.offering.id, startsAt: futureHour(hoursAhead), timezone: "UTC" });
  await confirmFreeBooking(db(), s, b.id);
  return { ...t, s, b };
}

describe("rescheduling", () => {
  it("moves a confirmed lesson atomically: old slot released, new slot held, event + notification recorded", async () => {
    const { s, b, offering, user: teacherUser } = await confirmedBooking(72);
    const newStart = futureHour(96);
    const r = await rescheduleBooking(db(), s, b.id, { startsAt: newStart, reason: "exam moved" });
    expect(r.rescheduleCount).toBe(1);
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.startsAt.getTime()).toBe(newStart.getTime());
    expect(row.status).toBe("confirmed");
    const { slots } = await computeSlots(db(), offering.id, new Date(b.startsAt.getTime() - 1), new Date(newStart.getTime() + 3_600_001));
    expect(slots.some((x) => x.getTime() === b.startsAt.getTime())).toBe(true);
    expect(slots.some((x) => x.getTime() === newStart.getTime())).toBe(false);
    const ev = await db().select().from(bookingEvents).where(eq(bookingEvents.bookingId, b.id));
    expect(ev.some((e) => e.reason?.startsWith("rescheduled"))).toBe(true);
    const n = await db().select().from(notifications).where(and(eq(notifications.userId, teacherUser.id), eq(notifications.kind, "booking_rescheduled")));
    expect(n).toHaveLength(1);
  });

  it("refuses a taken slot, late student changes and more than two reschedules", async () => {
    const { s, b, offering } = await confirmedBooking(72);
    const other = await makeUser();
    const taken = futureHour(100);
    await createBooking(db(), other, { offeringId: offering.id, startsAt: taken, timezone: "UTC" });
    await expect(rescheduleBooking(db(), s, b.id, { startsAt: taken, reason: "try taken" })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await rescheduleBooking(db(), s, b.id, { startsAt: futureHour(120), reason: "one" });
    await rescheduleBooking(db(), s, b.id, { startsAt: futureHour(130), reason: "two" });
    await expect(rescheduleBooking(db(), s, b.id, { startsAt: futureHour(140), reason: "three" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const late = await confirmedBooking(5);
    await expect(rescheduleBooking(db(), late.s, late.b.id, { startsAt: futureHour(50), reason: "late" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(rescheduleBooking(db(), late.user, late.b.id, { startsAt: futureHour(50), reason: "teacher ill" })).resolves.toMatchObject({ rescheduleCount: 1 });
    await expect(rescheduleBooking(db(), other, b.id, { startsAt: futureHour(150), reason: "not mine" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("concurrent reschedules into the same slot: exactly one wins", async () => {
    const a = await confirmedBooking(72);
    const s2 = await makeUser();
    const b2 = await createBooking(db(), s2, { offeringId: a.offering.id, startsAt: futureHour(80), timezone: "UTC" });
    await confirmFreeBooking(db(), s2, b2.id);
    const target = futureHour(110);
    const res = await Promise.allSettled([
      rescheduleBooking(db(), a.s, a.b.id, { startsAt: target, reason: "race a" }),
      rescheduleBooking(db(), s2, b2.id, { startsAt: target, reason: "race b" }),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.startsAt, target));
    expect(n).toBe(1);
  });
});

describe("group lessons", () => {
  async function groupSetup(capacity = 2) {
    await flag("group_lessons");
    const t = await makeTeacher({ priceMinor: 0 });
    const [o] = await db().insert(lessonOfferings).values({ teacherId: t.teacher.id, title: "Group", durationMinutes: 60, priceMinor: 0, currency: "EUR", mode: "online", type: "group", capacity, status: "published" }).returning();
    return { ...t, group: o };
  }

  it("is gated behind the feature flag", async () => {
    const t = await makeTeacher();
    await expect(createGroupSession(db(), t.user, { offeringId: t.offering.id, startsAt: futureHour(48) })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("enforces capacity under concurrency and blocks the teacher's 1:1 slots", async () => {
    const { user, group, offering } = await groupSetup(2);
    const start = futureHour(48);
    const session = await createGroupSession(db(), user, { offeringId: group.id, startsAt: start });
    const students = await Promise.all(Array.from({ length: 5 }, () => makeUser()));
    const res = await Promise.allSettled(students.map((s) => bookGroupSeat(db(), s, session.id, { timezone: "UTC" })));
    const ok = res.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(2);
    for (const r of res) if (r.status === "rejected") expect(isAppError(r.reason) && r.reason.code).toBe("SLOT_UNAVAILABLE");
    const [ls] = await listGroupSessions(db(), session.teacherId);
    expect(ls.seatsLeft).toBe(0);
    const { slots } = await computeSlots(db(), offering.id, new Date(start.getTime() - 1), new Date(start.getTime() + 3_600_001));
    expect(slots.some((x) => x.getTime() === start.getTime())).toBe(false);
    await expect(createBooking(db(), students[4], { offeringId: group.id, startsAt: futureHour(60), timezone: "UTC" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const seat = (ok[0] as PromiseFulfilledResult<{ id: string; studentId: string }>).value;
    const holder = students.find((s) => s.id === seat.studentId)!;
    await expect(confirmFreeBooking(db(), holder, seat.id)).resolves.toMatchObject({ status: "confirmed" });
  });

  it("refuses duplicate seats and sessions overlapping existing lessons", async () => {
    const { user, group, offering } = await groupSetup(5);
    const s = await makeUser();
    const session = await createGroupSession(db(), user, { offeringId: group.id, startsAt: futureHour(48) });
    await bookGroupSeat(db(), s, session.id, { timezone: "UTC" });
    await expect(bookGroupSeat(db(), s, session.id, { timezone: "UTC" })).rejects.toMatchObject({ code: "CONFLICT" });
    const other = await makeUser();
    await createBooking(db(), other, { offeringId: offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await expect(createGroupSession(db(), user, { offeringId: group.id, startsAt: futureHour(72) })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await expect(createGroupSession(db(), user, { offeringId: group.id, startsAt: futureHour(48) })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});

describe("support tickets", () => {
  it("users open tickets; staff internal notes are never visible to the requester; status changes are audited", async () => {
    const u = await makeUser();
    const agent = await makeUser(["support"], "Agent");
    const stranger = await makeUser();
    const t = await createTicket(db(), u, { subject: "Cannot join lesson", body: "The classroom button is disabled.", category: "technical" });
    await replyToTicket(db(), agent, t.id, { body: "Internal: check join window", internal: true });
    await replyToTicket(db(), agent, t.id, { body: "Hi, the room opens 10 minutes before.", internal: false });
    const mine = await getTicket(db(), u, t.id);
    expect(JSON.stringify(mine)).not.toContain("check join window");
    expect(mine.ticket.status).toBe("pending");
    const staff = await getTicket(db(), agent, t.id);
    expect(staff.messages.some((m) => m.isInternal)).toBe(true);
    await expect(getTicket(db(), stranger, t.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(replyToTicket(db(), u, t.id, { body: "sneaky", internal: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateTicket(db(), u, t.id, { status: "closed", reason: "nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateTicket(db(), agent, t.id, { status: "resolved", assignToMe: true, reason: "Explained join window" });
    const a = await db().select().from(auditLog).where(eq(auditLog.targetId, t.id));
    expect(a.map((x) => x.action)).toContain("support.ticket_updated");
    expect((await supportQueue(db(), agent, ["resolved"])).map((r) => r.t.id)).toContain(t.id);
    await expect(supportQueue(db(), u)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a ticket can only reference a booking the requester can see", async () => {
    const { b } = await confirmedBooking(72);
    const stranger = await makeUser();
    await expect(createTicket(db(), stranger, { subject: "About a lesson", body: "Some details here please", category: "booking", bookingId: b.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("admin: flags, taxonomy, moderation", () => {
  it("only admins toggle flags, with an audit entry", async () => {
    await flag("guardian_links", false);
    const admin = await makeUser(["admin"]);
    const support = await makeUser(["support"]);
    await expect(setFlag(db(), support, "guardian_links", { enabled: true, reason: "try it out" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setFlag(db(), admin, "guardian_links", { enabled: true, reason: "pilot launch" });
    expect(await isEnabled(db(), "guardian_links")).toBe(true);
    const [a] = await db().select().from(auditLog).where(eq(auditLog.targetId, "guardian_links"));
    expect(a.action).toBe("flag.enabled");
    await expect(setFlag(db(), admin, "nope", { enabled: true, reason: "unknown flag" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("subjects and categories are managed by admins only; slugs are unique", async () => {
    const admin = await makeUser(["admin"]);
    const student = await makeUser();
    const cat = await upsertCategory(db(), admin, { slug: "arts", nameEn: "Arts", nameFr: "Arts", nameAr: "الفنون", sortOrder: 1, isActive: true });
    await upsertSubject(db(), admin, { slug: "drawing", nameEn: "Drawing", nameFr: "Dessin", nameAr: "الرسم", categoryId: cat.id, isActive: true });
    await expect(upsertSubject(db(), admin, { slug: "drawing", nameEn: "Drawing 2", nameFr: "Dessin", nameAr: "الرسم", categoryId: cat.id, isActive: true })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(upsertCategory(db(), student, { slug: "x-y", nameEn: "XY", nameFr: "XY", nameAr: "XY", sortOrder: 0, isActive: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const tax = await listTaxonomy(db());
    expect(tax.find((c) => c.slug === "arts")?.subjects.map((s) => s.slug)).toEqual(["drawing"]);
  });

  it("moderators can unpublish a course and suspend a teacher profile, with audit", async () => {
    const t = await makeTeacher();
    const c = await createCourse(db(), t.user, { title: "Moderated course", summary: "", objectives: "", prerequisites: "", level: "beginner", language: "en", priceMinor: 0, currency: "EUR", passingScorePct: 70 });
    const sec = await addSection(db(), t.user, c.id, "S");
    await addLesson(db(), t.user, c.id, { sectionId: sec.id, title: "L", type: "text", content: "x", isPreview: true, durationMinutes: 5 });
    await setCourseStatus(db(), t.user, c.id, "published");
    const mod = await makeUser(["support"]);
    const student = await makeUser();
    await expect(moderateCourse(db(), student, c.id, { action: "unpublish", reason: "spam content" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(moderateCourse(db(), mod, c.id, { action: "unpublish", reason: "Copyrighted material" })).resolves.toMatchObject({ status: "archived" });
    await expect(moderateTeacher(db(), mod, t.teacher.id, { action: "suspend", reason: "Repeated policy violations" })).resolves.toMatchObject({ publishState: "suspended" });
    await expect(moderateTeacher(db(), mod, t.teacher.id, { action: "reinstate", reason: "Appeal accepted" })).resolves.toMatchObject({ publishState: "published" });
    const acts = (await db().select().from(auditLog)).map((a) => a.action);
    expect(acts).toEqual(expect.arrayContaining(["course.unpublished_by_moderator", "teacher.profile_suspended", "teacher.profile_reinstated"]));
  });
});

describe("guardian links", () => {
  it("nothing is shared before learner consent; after consent only limited read-only data; revocable", async () => {
    await flag("guardian_links");
    const guardian = await makeUser(["student"], "Parent");
    const { s: learner, b } = await confirmedBooking(72);
    const { id, token } = await requestGuardianLink(db(), guardian, { learnerEmail: learner.email, canViewBookings: true, canViewProgress: false });
    await expect(guardianOverview(db(), guardian, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const wrong = await makeUser();
    await expect(respondToGuardianLink(db(), wrong, { token, decision: "accept" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await respondToGuardianLink(db(), learner, { token, decision: "accept" });
    const view = await guardianOverview(db(), guardian, id);
    expect(view.lessons).toHaveLength(1);
    expect(view.progress).toBeNull();
    expect(JSON.stringify(view)).not.toContain(b.roomName);
    expect(JSON.stringify(view)).not.toContain("priceMinor");
    const consents = await db().select().from(consentRecords).where(and(eq(consentRecords.userId, learner.id), eq(consentRecords.consentType, "guardian_link")));
    expect(consents).toHaveLength(1);
    expect((await listGuardianLinks(db(), learner))[0].status).toBe("active");
    await revokeGuardianLink(db(), learner, id);
    await expect(guardianOverview(db(), guardian, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(respondToGuardianLink(db(), learner, { token, decision: "accept" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is off unless the flag is enabled", async () => {
    const g = await makeUser();
    await expect(requestGuardianLink(db(), g, { learnerEmail: "x@example.test", canViewBookings: true, canViewProgress: true })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});

describe("LMS: assignments, grading history, notes, bookmarks, announcements", () => {
  async function course() {
    const t = await makeTeacher();
    const c = await createCourse(db(), t.user, { title: "Essay writing", summary: "", objectives: "", prerequisites: "", level: "beginner", language: "en", priceMinor: 0, currency: "EUR", passingScorePct: 70 });
    const sec = await addSection(db(), t.user, c.id, "S");
    const l = await addLesson(db(), t.user, c.id, { sectionId: sec.id, title: "L1", type: "text", content: "x", isPreview: false, durationMinutes: 5 });
    await setCourseStatus(db(), t.user, c.id, "published");
    return { t, c, l };
  }

  it("written answers are graded manually with an append-only history; only enrolled learners submit", async () => {
    const { t, c } = await course();
    const learner = await makeUser();
    const outsider = await makeUser();
    await enrollFree(db(), learner, c.id);
    const a = await createAssignment(db(), t.user, c.id, { title: "Short essay", instructions: "Write 200 words about your goals.", maxPoints: 20 });
    await expect(createAssignment(db(), learner, c.id, { title: "Fake", instructions: "Learners cannot add this", maxPoints: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(submitAssignment(db(), outsider, a.id, { body: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const sub = await submitAssignment(db(), learner, a.id, { body: "My goals are..." });
    await expect(gradeSubmission(db(), learner, sub.id, { points: 20, feedback: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gradeSubmission(db(), t.user, sub.id, { points: 25, feedback: "" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await gradeSubmission(db(), t.user, sub.id, { points: 14, feedback: "Good start" });
    await gradeSubmission(db(), t.user, sub.id, { points: 16, feedback: "Regraded after review" });
    const hist = await gradingHistory(db(), learner, sub.id);
    expect(hist.map((h) => h.points)).toEqual([14, 16]);
    await expect(submitAssignment(db(), learner, a.id, { body: "changed" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(db().execute(sql`UPDATE submission_grades SET points = 20`)).rejects.toThrow();
    const mine = await listAssignments(db(), learner, c.id);
    expect(mine.assignments[0].mine?.points).toBe(16);
    expect(mine.assignments[0].submissions).toEqual([]);
    const teacherView = await listAssignments(db(), t.user, c.id);
    expect(teacherView.assignments[0].submissions).toHaveLength(1);
    expect(await db().select().from(submissionGrades)).toHaveLength(2);
  });

  it("notes and bookmarks are private to the learner and require access", async () => {
    const { c, l } = await course();
    const learner = await makeUser();
    const other = await makeUser();
    await expect(saveNote(db(), learner, l.id, { body: "note" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await enrollFree(db(), learner, c.id);
    await enrollFree(db(), other, c.id);
    await saveNote(db(), learner, l.id, { body: "first" });
    await saveNote(db(), learner, l.id, { body: "updated" });
    expect((await getNote(db(), learner, l.id))?.body).toBe("updated");
    expect(await getNote(db(), other, l.id)).toBeNull();
    await setBookmark(db(), learner, l.id, true);
    expect(await listBookmarks(db(), learner)).toHaveLength(1);
    expect(await listBookmarks(db(), other)).toHaveLength(0);
    await setBookmark(db(), learner, l.id, false);
    expect(await listBookmarks(db(), learner)).toHaveLength(0);
  });

  it("announcements notify every enrolled learner once", async () => {
    const { t, c } = await course();
    const learners = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const l of learners.slice(0, 2)) await enrollFree(db(), l, c.id);
    const a = await postAnnouncement(db(), t.user, c.id, { title: "Live Q&A", body: "Join the session on Friday." });
    expect(a.notified).toBe(2);
    expect(await db().select().from(notifications).where(eq(notifications.kind, "course_announcement"))).toHaveLength(2);
    expect(await listAnnouncements(db(), learners[0], c.id)).toHaveLength(1);
    await expect(listAnnouncements(db(), learners[2], c.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [e] = await db().select().from(courseEnrollments).where(eq(courseEnrollments.userId, learners[0].id));
    expect(e).toBeTruthy();
  });
});

describe("message attachments & realtime", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

  it("accepts real images/PDFs only, ≤5 MB, and only members can download", async () => {
    const { s, b } = await confirmedBooking(72);
    const conv = await openConversationForBooking(db(), s, b.id);
    const r = await sendAttachment(db(), s, conv.id, { name: "../../etc/passwd.png", bytes: PNG });
    expect(r.attachment.mime).toBe("image/png");
    expect(r.attachment.name).not.toContain("/");
    await expect(sendAttachment(db(), s, conv.id, { name: "evil.png", bytes: Buffer.from("<script>alert(1)</script>") })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(sendAttachment(db(), s, conv.id, { name: "big.pdf", bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(5 * 1024 * 1024)]) })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const stranger = await makeUser();
    await expect(sendAttachment(db(), stranger, conv.id, { name: "x.png", bytes: PNG })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getAttachmentForMember(db(), stranger, r.attachment.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getAttachmentForMember(db(), s, r.attachment.id)).resolves.toMatchObject({ mime: "image/png" });
  });

  it("new messages are published on the cb_messages channel (LISTEN/NOTIFY)", async () => {
    const { s, b } = await confirmedBooking(72);
    const conv = await openConversationForBooking(db(), s, b.id);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("LISTEN cb_messages");
    const got = new Promise<{ c: string; m: string }>((resolve) => client.on("notification", (n) => resolve(JSON.parse(n.payload!))));
    const r = await sendAttachment(db(), s, conv.id, { name: "a.png", bytes: PNG });
    const payload = await got;
    await client.end();
    expect(payload).toEqual({ c: conv.id, m: r.message.id });
  });
});

describe("staff two-factor (TOTP)", () => {
  it("enrolls, verifies the session, rejects replayed and wrong codes", async () => {
    const admin = await makeUser(["admin"]);
    const { token } = await createSession(db(), admin.id, "admin");
    let su = (await getSessionUser(db(), token))!;
    expect(su.mfaEnabled).toBe(false);
    const { secret, otpauthUri } = await beginTotpSetup(db(), admin.id);
    expect(otpauthUri).toContain("otpauth://totp/");
    await expect(enableTotp(db(), admin.id, su.sessionId, "000000")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const code = totp(secret);
    await enableTotp(db(), admin.id, su.sessionId, code);
    su = (await getSessionUser(db(), token))!;
    expect(su.mfaVerified).toBe(true);
    const s2 = await createSession(db(), admin.id, "admin");
    const su2 = (await getSessionUser(db(), s2.token))!;
    expect(su2.mfaEnabled).toBe(true);
    expect(su2.mfaVerified).toBe(false);
    await expect(verifySessionTotp(db(), admin.id, su2.sessionId, code)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await verifySessionTotp(db(), admin.id, su2.sessionId, totp(secret, Date.now() + 30_000));
    expect((await getSessionUser(db(), s2.token))!.mfaVerified).toBe(true);
  });
});
