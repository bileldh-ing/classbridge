import { describe, expect, it } from "vitest";
import { bookingActorFor, can, canViewBooking, switchableContexts } from "@/lib/auth/permissions";

const student = { id: "s1", roles: ["student" as const] };
const teacher = { id: "t1", roles: ["student" as const, "teacher" as const] };
const admin = { id: "a1", roles: ["admin" as const] };
const support = { id: "x1", roles: ["support" as const] };

describe("role permissions", () => {
  it("students cannot use admin or teacher powers", () => {
    expect(can(student, "learn.book")).toBe(true);
    expect(can(student, "admin.verify_teachers")).toBe(false);
    expect(can(student, "teach.manage_profile")).toBe(false);
  });
  it("support is least-privilege", () => {
    expect(can(support, "admin.manage_reports")).toBe(true);
    expect(can(support, "admin.verify_teachers")).toBe(false);
    expect(can(support, "admin.manage_refunds")).toBe(false);
  });
  it("suspended principals have no permissions", () => {
    expect(can({ ...admin, status: "suspended" }, "admin.view_dashboard")).toBe(false);
    expect(can(null, "learn.book")).toBe(false);
  });
  it("booking visibility is limited to participants and staff", () => {
    const b = { studentId: "s1", teacherUserId: "t1" };
    expect(canViewBooking(student, b)).toBe(true);
    expect(canViewBooking(teacher, b)).toBe(true);
    expect(canViewBooking({ id: "s2", roles: ["student"] }, b)).toBe(false);
    expect(canViewBooking(admin, b)).toBe(true);
    expect(bookingActorFor({ id: "s2", roles: ["student"] }, b)).toBeNull();
  });
  it("one identity can switch between capabilities", () => {
    expect(switchableContexts(["student", "teacher"])).toEqual(["student", "teacher"]);
    expect(switchableContexts(["support"])).toEqual(["admin"]);
  });
});
