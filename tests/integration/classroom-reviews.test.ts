import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/lib/db";
import { bookings, classroomEvents } from "@/lib/db/schema";
import { completeLesson, confirmFreeBooking, createBooking } from "@/lib/services/bookings";
import { issueClassroomToken } from "@/lib/services/classroom";
import { createReview, reviewEligibility } from "@/lib/services/reviews";
import { LiveKitProvider } from "@/lib/classroom/provider";
import { db, futureHour, makeTeacher, makeUser, resetDb } from "../helpers";

beforeEach(resetDb);
afterAll(closeDb);

// Real LiveKit SDK signing with throwaway credentials (JWT creation is local; no server contacted).
const livekit = new LiveKitProvider("wss://example.livekit.invalid", "APItestkey", "test-secret-that-is-long-enough-123456");

async function confirmedLesson(mode: "online" | "in_person" = "online") {
  const t = await makeTeacher({ priceMinor: 0, mode });
  const s = await makeUser();
  const b = await createBooking(db(), s, { offeringId: t.offering.id, startsAt: futureHour(72), timezone: "UTC" });
  await confirmFreeBooking(db(), s, b.id);
  return { ...t, s, b };
}

describe("classroom token authorization", () => {
  it("issues a short-lived, room-scoped token to participants inside the join window", async () => {
    const { s, b, user } = await confirmedLesson();
    const during = new Date(b.startsAt.getTime() + 5 * 60_000);
    const r = await issueClassroomToken(db(), s, b.id, livekit, during);
    const claims = JSON.parse(Buffer.from(r.token.split(".")[1], "base64url").toString());
    expect(claims.video).toMatchObject({ roomJoin: true, room: b.roomName });
    expect(claims.video.roomAdmin).toBeUndefined();
    expect(claims.video.roomCreate).toBeUndefined();
    expect(claims.sub).toBe(s.id);
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(600);
    // teacher joining moves the lesson in progress
    await issueClassroomToken(db(), user, b.id, livekit, during);
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("in_progress");
  });

  it("denies an unrelated user (and records the denial)", async () => {
    const { b } = await confirmedLesson();
    const stranger = await makeUser();
    await expect(issueClassroomToken(db(), stranger, b.id, livekit, new Date(b.startsAt.getTime() + 60_000))).rejects.toMatchObject({ code: "NOT_FOUND" });
    const ev = await db().select().from(classroomEvents).where(eq(classroomEvents.bookingId, b.id));
    expect(ev.map((e) => e.kind)).toEqual(["token_denied"]);
  });

  it("denies participants outside the join window", async () => {
    const { s, b } = await confirmedLesson();
    await expect(issueClassroomToken(db(), s, b.id, livekit, new Date(b.startsAt.getTime() - 11 * 60_000))).rejects.toMatchObject({ code: "OUTSIDE_JOIN_WINDOW" });
    await expect(issueClassroomToken(db(), s, b.id, livekit, new Date(b.endsAt.getTime() + 16 * 60_000))).rejects.toMatchObject({ code: "OUTSIDE_JOIN_WINDOW" });
    await expect(issueClassroomToken(db(), s, b.id, livekit, new Date(b.startsAt.getTime() - 9 * 60_000))).resolves.toBeTruthy();
  });

  it("reports provider-unconfigured honestly (after authorization)", async () => {
    const { s, b } = await confirmedLesson();
    await expect(issueClassroomToken(db(), s, b.id, null, new Date(b.startsAt.getTime() + 60_000))).rejects.toMatchObject({ code: "CLASSROOM_PROVIDER_NOT_CONFIGURED" });
  });

  it("denies unconfirmed and in-person bookings", async () => {
    const t = await makeTeacher({ priceMinor: 3000 });
    const s = await makeUser();
    const held = await createBooking(db(), s, { offeringId: t.offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await expect(issueClassroomToken(db(), s, held.id, livekit, new Date(held.startsAt.getTime() + 60_000))).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const ip = await confirmedLesson("in_person");
    await expect(issueClassroomToken(db(), ip.s, ip.b.id, livekit, new Date(ip.b.startsAt.getTime() + 60_000))).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});

describe("review eligibility", () => {
  it("requires a completed, attended booking; one review per booking; only the student", async () => {
    const { s, b, user } = await confirmedLesson();
    await expect(createReview(db(), s, { bookingId: b.id, rating: 5, body: "Great" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await completeLesson(db(), user, b.id, { studentAttendance: "present" }, new Date(b.endsAt.getTime()));
    const other = await makeUser();
    await expect(createReview(db(), other, { bookingId: b.id, rating: 1, body: "fake" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(createReview(db(), user, { bookingId: b.id, rating: 5, body: "self" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const r = await createReview(db(), s, { bookingId: b.id, rating: 5, body: "Clear explanations" });
    expect(r.rating).toBe(5);
    await expect(createReview(db(), s, { bookingId: b.id, rating: 4, body: "again" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await reviewEligibility(db(), s, b.id)).eligible).toBe(false);
  });

  it("a no-show booking cannot be reviewed", async () => {
    const { s, b, user } = await confirmedLesson();
    await completeLesson(db(), user, b.id, { studentAttendance: "absent" }, new Date(b.endsAt.getTime()));
    await expect(createReview(db(), s, { bookingId: b.id, rating: 1, body: "" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});
