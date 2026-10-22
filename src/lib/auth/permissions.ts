/** Role → permission matrix. Checked server-side on every privileged operation. */
export type Role = "student" | "teacher" | "admin" | "support";
export type Permission =
  | "learn.book" | "learn.review" | "learn.message"
  | "teach.manage_profile" | "teach.manage_bookings" | "teach.view_earnings"
  | "admin.view_dashboard" | "admin.verify_teachers" | "admin.manage_users" | "admin.view_audit"
  | "admin.view_payments" | "admin.manage_subjects" | "admin.manage_reports" | "admin.manage_refunds"
  | "support.manage_tickets" | "admin.manage_flags" | "admin.moderate_content";

const MATRIX: Record<Role, Permission[]> = {
  student: ["learn.book", "learn.review", "learn.message"],
  teacher: ["teach.manage_profile", "teach.manage_bookings", "teach.view_earnings", "learn.message"],
  support: ["admin.view_dashboard", "admin.manage_reports", "support.manage_tickets", "admin.moderate_content"],
  admin: [
    "admin.view_dashboard", "admin.verify_teachers", "admin.manage_users", "admin.view_audit",
    "admin.view_payments", "admin.manage_subjects", "admin.manage_reports", "admin.manage_refunds",
    "support.manage_tickets", "admin.manage_flags", "admin.moderate_content",
  ],
};

export type Principal = { id: string; roles: Role[]; status?: string };

export function can(p: Principal | null | undefined, perm: Permission): boolean {
  if (!p || (p.status && p.status !== "active")) return false;
  return p.roles.some((r) => MATRIX[r].includes(perm));
}

export function hasRole(p: Principal | null | undefined, role: Role): boolean {
  return !!p && p.roles.includes(role);
}

export function isStaff(p: Principal | null | undefined): boolean {
  return hasRole(p, "admin") || hasRole(p, "support");
}

/** Booking visibility: only the two participants and staff with a legitimate role. */
export function canViewBooking(p: Principal | null | undefined, b: { studentId: string; teacherUserId: string }): boolean {
  if (!p) return false;
  return p.id === b.studentId || p.id === b.teacherUserId || hasRole(p, "admin") || hasRole(p, "support");
}

export function bookingActorFor(p: Principal, b: { studentId: string; teacherUserId: string }): "student" | "teacher" | "admin" | null {
  if (p.id === b.studentId) return "student";
  if (p.id === b.teacherUserId) return "teacher";
  if (hasRole(p, "admin")) return "admin";
  return null;
}

/** The roles whose navigation a user may switch into. */
export function switchableContexts(roles: Role[]): Array<"student" | "teacher" | "admin"> {
  const out: Array<"student" | "teacher" | "admin"> = [];
  if (roles.includes("student")) out.push("student");
  if (roles.includes("teacher")) out.push("teacher");
  if (roles.includes("admin") || roles.includes("support")) out.push("admin");
  return out;
}
