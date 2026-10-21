import { describe, expect, it } from "vitest";
import { formatMoney, minorToMajorString, minorUnitDigits, parseMajorToMinor, platformFee, priceForDuration, splitEarning } from "@/lib/money";

describe("money (integer minor units)", () => {
  it("knows ISO minor-unit exponents", () => {
    expect(minorUnitDigits("EUR")).toBe(2);
    expect(minorUnitDigits("TND")).toBe(3);
    expect(minorUnitDigits("JPY")).toBe(0);
  });
  it("parses major strings without float error", () => {
    expect(parseMajorToMinor("19.99", "EUR")).toBe(1999);
    expect(parseMajorToMinor("0.10", "EUR")).toBe(10);
    expect(parseMajorToMinor("35,5", "EUR")).toBe(3550);
    expect(parseMajorToMinor("12.345", "TND")).toBe(12345);
    expect(() => parseMajorToMinor("1.234", "EUR")).toThrow();
    expect(() => parseMajorToMinor("-5", "EUR")).toThrow();
    expect(() => parseMajorToMinor("abc", "EUR")).toThrow();
  });
  it("round-trips to major strings", () => {
    expect(minorToMajorString(1999, "EUR")).toBe("19.99");
    expect(minorToMajorString(5, "EUR")).toBe("0.05");
    expect(minorToMajorString(12345, "TND")).toBe("12.345");
    expect(minorToMajorString(-250, "EUR")).toBe("-2.50");
  });
  it("computes platform fees with half-up integer rounding", () => {
    expect(platformFee(3000, 1500)).toBe(450);
    expect(platformFee(999, 1500)).toBe(150); // 149.85 → 150
    expect(platformFee(1, 1500)).toBe(0);
    expect(platformFee(0, 1500)).toBe(0);
    expect(() => platformFee(10.5, 1500)).toThrow();
    const s = splitEarning(4500, 1500);
    expect(s.fee + s.net).toBe(s.gross);
  });
  it("prices durations from hourly rate", () => {
    expect(priceForDuration(3000, 60)).toBe(3000);
    expect(priceForDuration(3000, 45)).toBe(2250);
    expect(priceForDuration(2999, 30)).toBe(1500);
  });
  it("formats for display only", () => {
    expect(formatMoney(2500, "EUR", "en")).toContain("25.00");
    expect(formatMoney(12345, "TND", "fr")).toMatch(/12,345/);
    expect(() => formatMoney(1.5, "EUR")).toThrow();
  });
});
