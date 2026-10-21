import { describe, expect, it } from "vitest";
import { generateSlots, groupSlotsByLocalDay, isSlotBookable, isValidTimezone, type SlotInput } from "@/lib/scheduling/slots";

const base = (over: Partial<SlotInput>): SlotInput => ({
  rules: [], exceptions: [], busy: [], teacherTimezone: "UTC", durationMinutes: 60, bufferMinutes: 0,
  minNoticeMinutes: 0, maxLessonsPerDay: 10, horizonDays: 30, now: new Date("2026-06-01T00:00:00Z"),
  from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-06-02T00:00:00Z"), ...over,
});

describe("availability → slots", () => {
  it("generates 30-minute-step slots inside a weekly rule (teacher timezone)", () => {
    // 2026-06-01 is a Monday; 09:00–11:00 Africa/Tunis (UTC+1) = 08:00–10:00 UTC
    const s = generateSlots(base({ rules: [{ weekday: 1, startMinute: 540, endMinute: 660 }], teacherTimezone: "Africa/Tunis" }));
    expect(s.map((d) => d.toISOString())).toEqual(["2026-06-01T08:00:00.000Z", "2026-06-01T08:30:00.000Z", "2026-06-01T09:00:00.000Z"]);
  });
  it("respects minimum notice", () => {
    const s = generateSlots(base({ rules: [{ weekday: 1, startMinute: 0, endMinute: 240 }], minNoticeMinutes: 120 }));
    expect(s[0].toISOString()).toBe("2026-06-01T02:00:00.000Z");
  });
  it("excludes busy bookings plus buffer", () => {
    const s = generateSlots(base({
      rules: [{ weekday: 1, startMinute: 480, endMinute: 720 }], bufferMinutes: 15,
      busy: [{ startsAt: new Date("2026-06-01T10:00:00Z"), endsAt: new Date("2026-06-01T11:00:00Z") }],
    }));
    const iso = s.map((d) => d.toISOString());
    expect(iso).toContain("2026-06-01T08:30:00.000Z"); // ends 09:30, before 09:45 buffer
    expect(iso).not.toContain("2026-06-01T09:00:00.000Z"); // ends 10:00, inside buffer
    expect(iso).not.toContain("2026-06-01T10:30:00.000Z");
    expect(iso).not.toContain("2026-06-01T11:00:00.000Z"); // within 15 min after
  });
  it("applies blocked and extra exceptions", () => {
    const s = generateSlots(base({
      rules: [{ weekday: 1, startMinute: 480, endMinute: 600 }],
      exceptions: [
        { kind: "blocked", startsAt: new Date("2026-06-01T08:00:00Z"), endsAt: new Date("2026-06-01T09:00:00Z") },
        { kind: "extra", startsAt: new Date("2026-06-01T18:00:00Z"), endsAt: new Date("2026-06-01T19:00:00Z") },
      ],
    }));
    expect(s.map((d) => d.toISOString())).toEqual(["2026-06-01T09:00:00.000Z", "2026-06-01T18:00:00.000Z"]);
  });
  it("enforces max lessons per day", () => {
    const s = generateSlots(base({
      rules: [{ weekday: 1, startMinute: 480, endMinute: 1200 }], maxLessonsPerDay: 1,
      busy: [{ startsAt: new Date("2026-06-01T06:00:00Z"), endsAt: new Date("2026-06-01T07:00:00Z") }],
    }));
    expect(s).toEqual([]);
  });
  it("shifts windows that start in the DST spring-forward gap (Europe/Paris 2026-03-29)", () => {
    const s = generateSlots(base({
      rules: [{ weekday: 7, startMinute: 120, endMinute: 240 }], teacherTimezone: "Europe/Paris", // 02:00–04:00 local
      now: new Date("2026-03-28T00:00:00Z"), from: new Date("2026-03-28T00:00:00Z"), to: new Date("2026-03-30T00:00:00Z"),
    }));
    // 02:00 local does not exist; the window starts at 03:00 CEST (= 01:00Z) and ends 04:00 CEST (= 02:00Z)
    expect(s.map((d) => d.toISOString())).toEqual(["2026-03-29T01:00:00.000Z"]);
  });
  it("keeps the same local wall-clock time across the autumn DST change", () => {
    const rules = [{ weekday: 6, startMinute: 600, endMinute: 660 }, { weekday: 1, startMinute: 600, endMinute: 660 }];
    const s = generateSlots(base({
      rules, teacherTimezone: "Europe/Paris",
      now: new Date("2026-10-23T00:00:00Z"), from: new Date("2026-10-23T00:00:00Z"), to: new Date("2026-10-27T00:00:00Z"),
    }));
    // Sat 24 Oct 10:00 CEST = 08:00Z; Mon 26 Oct 10:00 CET = 09:00Z
    expect(s.map((d) => d.toISOString())).toEqual(["2026-10-24T08:00:00.000Z", "2026-10-26T09:00:00.000Z"]);
  });
  it("respects booking horizon and validates a requested slot", () => {
    const input = base({ rules: [{ weekday: 1, startMinute: 0, endMinute: 1440 }, { weekday: 2, startMinute: 0, endMinute: 1440 }], horizonDays: 1, to: new Date("2026-06-03T00:00:00Z") });
    const s = generateSlots(input);
    expect(s.every((d) => d < new Date("2026-06-02T00:00:00Z"))).toBe(true);
    expect(isSlotBookable(input, new Date("2026-06-01T10:00:00Z"))).toBe(true);
    expect(isSlotBookable(input, new Date("2026-06-01T10:15:00Z"))).toBe(false);
    expect(isSlotBookable(input, new Date("2026-06-02T10:00:00Z"))).toBe(false);
  });
  it("groups slots by the viewer's local day", () => {
    const g = groupSlotsByLocalDay([new Date("2026-06-01T23:30:00Z")], "Asia/Tokyo");
    expect(g[0].date).toBe("2026-06-02");
  });
  it("validates timezones", () => {
    expect(isValidTimezone("Africa/Tunis")).toBe(true);
    expect(isValidTimezone("Mars/Base")).toBe(false);
  });
});
