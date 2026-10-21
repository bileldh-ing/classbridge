import { describe, expect, it } from "vitest";
import { allowedTransitions, BOOKING_STATUSES, canTransition, isTerminal, SLOT_OCCUPYING } from "@/lib/booking/state-machine";
import { readFileSync } from "node:fs";

describe("booking state machine", () => {
  it("follows the happy path with the right actors", () => {
    expect(canTransition("draft", "slot_held", "student")).toBe(true);
    expect(canTransition("slot_held", "awaiting_payment", "student")).toBe(true);
    expect(canTransition("awaiting_payment", "confirmed", "provider")).toBe(true);
    expect(canTransition("confirmed", "in_progress", "teacher")).toBe(true);
    expect(canTransition("in_progress", "completed", "teacher")).toBe(true);
  });
  it("only the provider can confirm a paid booking", () => {
    expect(canTransition("awaiting_payment", "confirmed", "student")).toBe(false);
    expect(canTransition("awaiting_payment", "confirmed", "teacher")).toBe(false);
    expect(canTransition("awaiting_payment", "confirmed", "admin")).toBe(false);
  });
  it("students cannot complete lessons or mark teacher attendance", () => {
    expect(canTransition("confirmed", "completed", "student")).toBe(false);
    expect(canTransition("confirmed", "no_show_student", "student")).toBe(false);
  });
  it("refunded only via provider-verified event", () => {
    expect(canTransition("refund_pending", "refunded", "admin")).toBe(false);
    expect(canTransition("refund_pending", "refunded", "provider")).toBe(true);
  });
  it("terminal states have no exits", () => {
    for (const s of ["expired", "canceled_by_student", "payment_failed", "refunded"] as const) {
      expect(isTerminal(s)).toBe(true);
      for (const to of BOOKING_STATUSES) expect(canTransition(s, to, "admin")).toBe(false);
    }
  });
  it("cannot skip from slot_held to completed", () => {
    expect(allowedTransitions("slot_held", "teacher")).toEqual([]);
    expect(canTransition("slot_held", "completed", "system")).toBe(false);
  });
  it("slot-occupying statuses match the DB exclusion constraint", () => {
    const sqlText = readFileSync("drizzle/0002_constraints.sql", "utf8");
    const m = sqlText.match(/bookings_teacher_no_overlap[\s\S]*?WHERE \(status IN \(([^)]*)\)\)/);
    const dbList = m![1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
    expect(dbList).toEqual([...SLOT_OCCUPYING].sort());
  });
});
