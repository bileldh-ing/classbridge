import Link from "next/link";
import { GraduationCap, Bell } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { currentUser } from "@/lib/auth/session";
import { LocaleSwitcher } from "@/components/client/locale-switcher";
import { LinkButton } from "@/components/ui";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export async function SiteHeader() {
  const { t, locale } = await getI18n();
  const user = await currentUser();
  let unread = 0;
  if (user) {
    const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    unread = r.n;
  }
  const home = !user ? "/" : user.activeRole === "teacher" ? "/teach" : user.activeRole === "admin" || user.activeRole === "support" ? "/admin" : "/dashboard";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
          <GraduationCap aria-hidden className="size-7 text-brand-600" />
          <span className="text-lg">{t.brand.name}</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 text-sm lg:flex">
          {[["/teachers", t.nav.findTeachers], ["/courses", t.nav.courses], ["/subjects", t.nav.subjects], ["/how-it-works", t.nav.howItWorks], ["/become-a-teacher", t.nav.becomeTeacher], ["/pricing", t.nav.pricing], ["/help", t.nav.help]].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-2.5 py-2 text-muted hover:bg-canvas hover:text-ink">{label}</Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <LocaleSwitcher current={locale} label={t.nav.language} />
          {user ? (
            <>
              <Link href="/notifications" className="relative rounded-md p-2 hover:bg-canvas" aria-label={`${t.nav.notifications}${unread ? ` (${unread})` : ""}`}>
                <Bell aria-hidden className="size-5" />
                {unread > 0 && <span className="absolute -end-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
              </Link>
              <LinkButton href={home} variant="secondary">{t.nav.overview}</LinkButton>
            </>
          ) : (
            <>
              <LinkButton href="/signin" variant="ghost">{t.nav.signIn}</LinkButton>
              <LinkButton href="/signup">{t.nav.joinFree}</LinkButton>
            </>
          )}
        </div>
      </div>
      <nav aria-label="Primary mobile" className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1 text-sm lg:hidden">
        {[["/teachers", t.nav.findTeachers], ["/courses", t.nav.courses], ["/subjects", t.nav.subjects], ["/become-a-teacher", t.nav.becomeTeacher], ["/help", t.nav.help]].map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted hover:bg-canvas">{label}</Link>
        ))}
      </nav>
    </header>
  );
}
