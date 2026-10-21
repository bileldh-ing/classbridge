import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb } from "@/lib/db";
import { bookingEvents, bookings } from "@/lib/db/schema";
import { cancelBooking, completeLesson, confirmFreeBooking, createBooking, getBookingDetail, expireStaleHolds } from "@/lib/services/bookings";
import { computeSlots } from "@/lib/services/teachers";
import { db, futureHour, makeTeacher, makeUser, resetDb } from "../helpers";
import { isAppError } from "@/lib/errors";

beforeEach(resetDb);
afterAll(closeDb);

describe("booking creation & double-booking prevention (real Postgres)", () => {
  it("rejects concurrent bookings of the same slot: exactly one succeeds", async () => {
    const { offering } = await makeTeacher();
    const students = await Promise.all(Array.from({ length: 6 }, (_, i) => makeUser(["student"], `S${i}`)));
    const start = futureHour(72);
    const results = await Promise.allSettled(students.map((s) => createBooking(db(), s, { offeringId: offering.id, startsAt: start, timezone: "UTC" })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(5);
    for (const f of failed) expect(isAppError(f.reason) && f.reason.code).toBe("SLOT_UNAVAILABLE");
    const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(bookings);
    expect(n).toBe(1);
  });

  it("the database itself rejects overlapping active bookings (exclusion constraint)", async () => {
    const { offering, teacher } = await makeTeacher();
    const s1 = await makeUser(); const s2 = await makeUser();
    const start = futureHour(72);
    await createBooking(db(), s1, { offeringId: offering.id, startsAt: start, timezone: "UTC" });
    await expect(db().insert(bookings).values({
      studentId: s2.id, teacherId: teacher.id, offeringId: offering.id, startsAt: new Date(start.getTime() + 30 * 60_000),
      endsAt: new Date(start.getTime() + 90 * 60_000), studentTimezone: "UTC", mode: "online", status: "confirmed",
      priceMinor: 0, currency: "EUR", cancellationPolicy: "flex-24h-v1", roomName: "raw-insert",
    })).rejects.toMatchObject({ cause: { code: "23P01" } });
  });

  it("rejects slots outside availability and own-lesson bookings", async () => {
    const { offering, user } = await makeTeacher();
    const s = await makeUser();
    const odd = new Date(futureHour(72).getTime() + 15 * 60_000);
    await expect(createBooking(db(), s, { offeringId: offering.id, startsAt: odd, timezone: "UTC" })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await expect(createBooking(db(), user, { offeringId: offering.id, startsAt: futureHour(72), timezone: "UTC" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("expired holds release the slot and are recorded as events", async () => {
    const { offering } = await makeTeacher();
    const s1 = await makeUser(); const s2 = await makeUser();
    const start = futureHour(72);
    const b = await createBooking(db(), s1, { offeringId: offering.id, startsAt: start, timezone: "UTC" });
    expect((await computeSlots(db(), offering.id, start, new Date(start.getTime() + 3600_000))).slots.map(Number)).not.toContain(start.getTime());
    await db().update(bookings).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(bookings.id, b.id));
    const b2 = await createBooking(db(), s2, { offeringId: offering.id, startsAt: start, timezone: "UTC" });
    expect(b2.studentId).toBe(s2.id);
    const [old] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(old.status).toBe("expired");
    const ev = await db().select().from(bookingEvents).where(eq(bookingEvents.bookingId, b.id));
    expect(ev.map((e) => e.toStatus)).toEqual(["slot_held", "expired"]);
    expect(await expireStaleHolds(db())).toBe(0);
  });

  it("idempotency key returns the same booking", async () => {
    const { offering } = await makeTeacher();
    const s = await makeUser();
    const input = { offeringId: offering.id, startsAt: futureHour(72), timezone: "UTC", idempotencyKey: "key-12345678" };
    const a = await createBooking(db(), s, input);
    const b = await createBooking(db(), s, input);
    expect(b.id).toBe(a.id);
  });

  it("free booking confirms without a payment provider; history is append-only", async () => {
    const { offering } = await makeTeacher({ priceMinor: 0 });
    const s = await makeUser();
    const b = await createBooking(db(), s, { offeringId: offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await confirmFreeBooking(db(), s, b.id);
    const [row] = await db().select().from(bookings).where(eq(bookings.id, b.id));
    expect(row.status).toBe("confirmed");
    expect(row.paymentStatus).toBe("not_required");
    await expect(db().execute(sql`UPDATE booking_events SET reason = 'tampered' WHERE booking_id = ${b.id}`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
    await expect(db().execute(sql`DELETE FROM booking_events WHERE booking_id = ${b.id}`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
  });

  it("paid bookings cannot be confirmed through the free path", async () => {
    const { offering } = await makeTeacher({ priceMinor: 3000 });
    const s = await makeUser();
    const b = await createBooking(db(), s, { offeringId: offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await expect(confirmFreeBooking(db(), s, b.id)).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});

describe("booking authorization", () => {
  it("another student cannot read, cancel or confirm someone else's booking", async () => {
    const { offering } = await makeTeacher({ priceMinor: 0 });
    const owner = await makeUser(); const intruder = await makeUser();
    const b = await createBooking(db(), owner, { offeringId: offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await expect(getBookingDetail(db(), intruder, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelBooking(db(), intruder, b.id, "nope nope", null)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(confirmFreeBooking(db(), intruder, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const other = await makeTeacher();
    await expect(getBookingDetail(db(), other.user, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const d = await getBookingDetail(db(), owner, b.id);
    expect(d.viewerRole).toBe("student");
  });

  it("only the booking's teacher can record attendance, and only after the start", async () => {
    const { offering, user: teacherUser } = await makeTeacher({ priceMinor: 0 });
    const s = await makeUser();
    const b = await createBooking(db(), s, { offeringId: offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await confirmFreeBooking(db(), s, b.id);
    await expect(completeLesson(db(), s, b.id, { studentAttendance: "present" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(completeLesson(db(), teacherUser, b.id, { studentAttendance: "present" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const after = new Date(b.startsAt.getTime() + 61 * 60_000);
    const r = await completeLesson(db(), teacherUser, b.id, { studentAttendance: "present", note: "Covered quadratics" }, after);
    expect(r.status).toBe("completed");
  });

  it("free confirmed lesson cancelled by student needs no refund", async () => {
    const { offering } = await makeTeacher({ priceMinor: 0 });
    const s = await makeUser();
    const b = await createBooking(db(), s, { offeringId: offering.id, startsAt: futureHour(72), timezone: "UTC" });
    await confirmFreeBooking(db(), s, b.id);
    const r = await cancelBooking(db(), s, b.id, "schedule change", null);
    expect(r.status).toBe("canceled_by_student");
  });
});
