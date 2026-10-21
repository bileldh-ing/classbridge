import Link from "next/link";
import { BookOpen, CalendarDays, CreditCard, Heart, Home, LayoutDashboard, MessageSquare, Search, Settings, ShieldCheck, Users, FileText, Wallet, UserCircle, ClipboardList, Bell, Flag, Receipt, Award, GraduationCap } from "lucide-react";
import type { SessionUser } from "@/lib/auth/core";
import { getI18n } from "@/lib/i18n/server";
import { RoleSwitcher } from "@/components/client/role-switcher";
import { SignOutButton } from "@/components/client/sign-out-button";
import { switchableContexts, can } from "@/lib/auth/permissions";
import { Alert } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> };

export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { t } = await getI18n();
  const ctx = user.activeRole === "support" ? "admin" : user.activeRole;
  const items: Item[] =
    ctx === "teacher" ? [
      { href: "/teach", label: t.nav.overview, icon: LayoutDashboard },
      { href: "/teach/profile", label: t.nav.publicProfile, icon: UserCircle },
      { href: "/teach/offerings", label: t.nav.offerings, icon: ClipboardList },
      { href: "/teach/availability", label: t.nav.availability, icon: CalendarDays },
      { href: "/teach/bookings", label: t.nav.bookings, icon: BookOpen },
      { href: "/teach/credentials", label: t.nav.credentials, icon: Award },
      { href: "/teach/courses", label: t.nav.teacherCourses, icon: GraduationCap },
      { href: "/teach/earnings", label: t.nav.earnings, icon: Wallet },
      { href: "/messages", label: t.nav.messages, icon: MessageSquare },
      { href: "/notifications", label: t.nav.notifications, icon: Bell },
      { href: "/settings", label: t.nav.settings, icon: Settings },
    ] : ctx === "admin" ? ([
      { href: "/admin", label: t.nav.overview, icon: LayoutDashboard, perm: "admin.view_dashboard" },
      { href: "/admin/teachers", label: t.nav.adminTeachers, icon: ShieldCheck, perm: "admin.verify_teachers" },
      { href: "/admin/users", label: t.nav.adminUsers, icon: Users, perm: "admin.manage_users" },
      { href: "/admin/bookings", label: t.nav.adminBookings, icon: BookOpen, perm: "admin.view_payments" },
      { href: "/admin/payments", label: t.nav.adminPayments, icon: Receipt, perm: "admin.view_payments" },
      { href: "/admin/refunds", label: t.nav.adminRefunds, icon: CreditCard, perm: "admin.manage_refunds" },
      { href: "/admin/reports", label: t.nav.adminReports, icon: Flag, perm: "admin.manage_reports" },
      { href: "/admin/audit", label: t.nav.adminAudit, icon: FileText, perm: "admin.view_audit" },
      { href: "/settings", label: t.nav.settings, icon: Settings, perm: "admin.view_dashboard" },
    ] as const).filter((i) => can(user, i.perm)) : [
      { href: "/dashboard", label: t.nav.overview, icon: Home },
      { href: "/teachers", label: t.nav.findTeachers, icon: Search },
      { href: "/lessons", label: t.nav.myLessons, icon: CalendarDays },
      { href: "/my-courses", label: t.nav.myCourses, icon: GraduationCap },
      { href: "/messages", label: t.nav.messages, icon: MessageSquare },
      { href: "/saved", label: t.nav.saved, icon: Heart },
      { href: "/payments", label: t.nav.payments, icon: CreditCard },
      { href: "/notifications", label: t.nav.notifications, icon: Bell },
      { href: "/settings", label: t.nav.settings, icon: Settings },
    ];
  const roleLabels = { student: t.nav.asStudent, teacher: t.nav.asTeacher, admin: t.nav.asAdmin };
  const roleHome = { student: "/dashboard", teacher: "/teach", admin: "/admin" };
  const options = switchableContexts(user.roles).map((r) => ({ value: r, label: roleLabels[r], href: roleHome[r] }));
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
      <aside className="md:w-60 md:shrink-0">
        <div className="mb-3 rounded-xl border border-line p-3">
          <p className="truncate text-sm font-medium">{user.displayName}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          <div className="mt-2"><RoleSwitcher current={ctx} options={options} label={t.nav.switchTo} /></div>
        </div>
        <nav aria-label={t.nav.menu} className="flex gap-1 overflow-x-auto md:flex-col">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-ink hover:bg-canvas">
              <Icon aria-hidden className="size-4 text-muted" />{label}
            </Link>
          ))}
          <SignOutButton label={t.nav.signOut} />
        </nav>
      </aside>
      <main id="main" className="min-w-0 flex-1">
        {!user.emailVerified && (
          <Alert tone="warn" className="mb-4">
            <span className="me-2">{t.auth.verifyBanner}</span>
            <ActionButton endpoint="/api/auth/resend-verification" label={t.auth.resend} variant="ghost" successText={t.auth.resent} />
          </Alert>
        )}
        {children}
      </main>
    </div>
  );
}
