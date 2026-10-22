import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hotp, totp, verifyTotp } from "@/lib/auth/totp";
import { reschedulePolicyError } from "@/lib/services/reschedule";
import { buildEvent, parseDsn } from "@/lib/monitoring";
import { scrub } from "@/lib/log";
import { safeFileName, sniffFile } from "@/lib/storage";
import { buildCsp } from "@/lib/security/csp";

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 appendix B test secret "12345678901234567890" (SHA-1), truncated to 6 digits.
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test vectors", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totp(secret, 59_000)).toBe("287082");
    expect(totp(secret, 1111111109_000)).toBe("081804");
    expect(totp(secret, 1234567890_000)).toBe("005924");
    expect(hotp(secret, 0)).toBe("755224");
  });
  it("round-trips base32 and accepts ±1 step, rejects replays", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    const now = 1_800_000_000_000;
    const prev = totp(secret, now - 30_000);
    const step = verifyTotp(secret, prev, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, prev, now, step)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
  });
  it("encrypts secrets at rest (AES-GCM, tamper-evident)", () => {
    const blob = encryptSecret("JBSWY3DPEHPK3PXP", "k".repeat(40));
    expect(blob).not.toContain("JBSWY3DP");
    expect(decryptSecret(blob, "k".repeat(40))).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decryptSecret(blob, "z".repeat(40))).toThrow();
  });
});

describe("reschedule policy", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const base = { status: "confirmed", rescheduleCount: 0, isGroup: false, now };
  it("students need 24h notice, teachers 2h; max two moves; confirmed 1:1 only", () => {
    expect(reschedulePolicyError({ ...base, who: "student", startsAt: new Date("2026-11-02T11:00:00Z") })).toBeNull();
    expect(reschedulePolicyError({ ...base, who: "student", startsAt: new Date("2026-11-02T09:00:00Z") })).toMatch(/24 hours/);
    expect(reschedulePolicyError({ ...base, who: "teacher", startsAt: new Date("2026-11-01T13:00:00Z") })).toBeNull();
    expect(reschedulePolicyError({ ...base, who: "teacher", startsAt: new Date("2026-11-01T11:00:00Z") })).toMatch(/2 hours/);
    expect(reschedulePolicyError({ ...base, who: "student", rescheduleCount: 2, startsAt: new Date("2026-11-10T10:00:00Z") })).toMatch(/at most 2/);
    expect(reschedulePolicyError({ ...base, who: "student", status: "awaiting_payment", startsAt: new Date("2026-11-10T10:00:00Z") })).toMatch(/Only confirmed/);
    expect(reschedulePolicyError({ ...base, who: "student", isGroup: true, startsAt: new Date("2026-11-10T10:00:00Z") })).toMatch(/Group/);
  });
});

describe("monitoring & logging scrub PII", () => {
  it("parses DSNs and builds events without query strings, emails or secrets", () => {
    expect(parseDsn("https://abc123@o1.ingest.sentry.io/42").envelopeUrl).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
    const ev = buildEvent(new Error("failed for jane.doe@example.com"), { route: "/api/reset?token=SECRET", userId: "u1", extra: { password: "hunter2", note: "mail bob@x.io" } });
    const s = JSON.stringify(ev);
    expect(s).not.toContain("SECRET");
    expect(s).not.toContain("jane.doe@example.com");
    expect(s).not.toContain("bob@x.io");
    expect(s).not.toContain("hunter2");
    expect(ev.user).toEqual({ id: "u1" });
  });
  it("redacts sensitive keys recursively", () => {
    expect(scrub({ token: "t", nested: { authorization: "Bearer x", ok: 1 } })).toEqual({ token: "[redacted]", nested: { authorization: "[redacted]", ok: 1 } });
  });
});

describe("uploads", () => {
  it("detects types by magic bytes and sanitises names", () => {
    expect(sniffFile(Buffer.from("RIFF0000WEBPVP8 "), ["webp"])?.mime).toBe("image/webp");
    expect(sniffFile(Buffer.from("RIFF0000WEBPVP8 "))).toBeNull();
    expect(sniffFile(Buffer.from("GIF89a......"), ["gif"])?.ext).toBe("gif");
    expect(sniffFile(Buffer.from("MZ\x90\x00"))).toBeNull();
    expect(safeFileName('../../a"b<c>.png', "png")).toBe("a_b_c_.png");
    expect(safeFileName("", "pdf")).toBe("file");
  });
});

describe("content security policy", () => {
  it("uses a per-request nonce with strict-dynamic and no unsafe-inline/eval for scripts in production", () => {
    const csp = buildCsp("abc123", { dev: false, livekitUrl: "wss://lk.example.com" });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("wss://lk.example.com");
    expect(csp).toContain("upgrade-insecure-requests");
  });
});
