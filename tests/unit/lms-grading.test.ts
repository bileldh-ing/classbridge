import { describe, expect, it } from "vitest";
import { gradeQuiz, isCourseComplete, progressPct, seededShuffle } from "@/lib/lms/grading";
import { sniffFile } from "@/lib/storage";
import { buildIcs } from "@/lib/time";

describe("quiz grading", () => {
  const qs = [{ id: "a", points: 1, correctOptionIds: ["a1"] }, { id: "b", points: 2, correctOptionIds: ["b1", "b2"] }, { id: "c", points: 1, correctOptionIds: ["c3"] }];
  it("scores exact matches only (multi-select must match fully)", () => {
    const r = gradeQuiz(qs, { a: ["a1"], b: ["b1"], c: ["c3"] }, 70);
    expect(r.perQuestion).toEqual({ a: true, b: false, c: true });
    expect(r.scorePct).toBe(50);
    expect(r.passed).toBe(false);
    expect(gradeQuiz(qs, { a: ["a1"], b: ["b2", "b1", "b1"], c: ["c3"] }, 70)).toMatchObject({ scorePct: 100, passed: true });
  });
  it("treats missing answers as wrong and empty quizzes as not passable", () => {
    expect(gradeQuiz(qs, {}, 70).scorePct).toBe(0);
    expect(gradeQuiz([], {}, 0).passed).toBe(false);
  });
});

describe("course completion / certificate eligibility", () => {
  const lessons = [{ id: "l1", type: "text" }, { id: "l2", type: "video" }, { id: "q1", type: "quiz" }];
  it("requires every lesson and a passed quiz", () => {
    expect(isCourseComplete(lessons, new Set(["l1", "l2"]), new Set())).toBe(false);
    expect(isCourseComplete(lessons, new Set(["l1"]), new Set(["q1"]))).toBe(false);
    expect(isCourseComplete(lessons, new Set(["l1", "l2"]), new Set(["q1"]))).toBe(true);
    expect(isCourseComplete([], new Set(), new Set())).toBe(false);
    expect(progressPct(lessons, new Set(["l1"]), new Set(["q1"]))).toBe(67);
  });
  it("shuffles deterministically per seed without losing items", () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6], "user:quiz:0");
    expect(seededShuffle([1, 2, 3, 4, 5, 6], "user:quiz:0")).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("upload sniffing & calendar export", () => {
  it("accepts only real PDF/PNG/JPEG signatures", () => {
    expect(sniffFile(Buffer.from("%PDF-1.7\n..."))?.ext).toBe("pdf");
    expect(sniffFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe("png");
    expect(sniffFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffFile(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffFile(Buffer.from("MZ\x90\x00"))).toBeNull();
  });
  it("builds an RFC 5545 event in UTC with escaped text", () => {
    const ics = buildIcs({ uid: "x", start: new Date(Date.UTC(2026, 9, 25, 9, 0)), end: new Date(Date.UTC(2026, 9, 25, 10, 0)), title: "Maths; algebra, ch.1", description: "Line1\nLine2", url: "https://e.test" });
    expect(ics).toContain("DTSTART:20261025T090000Z");
    expect(ics).toContain("SUMMARY:Maths\\; algebra\\, ch.1");
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});
