import { describe, expect, it } from "vitest";
import { refundableAmount } from "@/lib/policy/cancellation";

const start = new Date("2026-06-10T10:00:00Z");
const at = (h: number) => new Date(start.getTime() - h * 3600_000);

describe("cancellation policy", () => {
  it("flex-24h: full refund ≥24h, none after", () => {
    expect(refundableAmount({ policy: "flex-24h-v1", priceMinor: 3000, startsAt: start, canceledAt: at(24), canceledBy: "student" })).toBe(3000);
    expect(refundableAmount({ policy: "flex-24h-v1", priceMinor: 3000, startsAt: start, canceledAt: at(23.9), canceledBy: "student" })).toBe(0);
  });
  it("moderate-48h: tiers", () => {
    expect(refundableAmount({ policy: "moderate-48h-v1", priceMinor: 3001, startsAt: start, canceledAt: at(50), canceledBy: "student" })).toBe(3001);
    expect(refundableAmount({ policy: "moderate-48h-v1", priceMinor: 3001, startsAt: start, canceledAt: at(30), canceledBy: "student" })).toBe(1500);
    expect(refundableAmount({ policy: "moderate-48h-v1", priceMinor: 3001, startsAt: start, canceledAt: at(2), canceledBy: "student" })).toBe(0);
  });
  it("teacher cancellations are always fully refunded; free lessons refund nothing", () => {
    expect(refundableAmount({ policy: "flex-24h-v1", priceMinor: 3000, startsAt: start, canceledAt: at(1), canceledBy: "teacher" })).toBe(3000);
    expect(refundableAmount({ policy: "flex-24h-v1", priceMinor: 0, startsAt: start, canceledAt: at(100), canceledBy: "student" })).toBe(0);
  });
});
