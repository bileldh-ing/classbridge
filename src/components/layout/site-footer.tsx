import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

export async function SiteFooter() {
  const { t } = await getI18n();
  return (
    <footer className="mt-16 border-t border-line bg-canvas">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div><p className="font-semibold">{t.brand.name}</p><p className="mt-2 text-muted">{t.brand.tagline}</p></div>
        <nav aria-label="Footer" className="flex flex-col gap-2">
          <Link href="/teachers" className="text-muted hover:text-ink">{t.nav.findTeachers}</Link>
          <Link href="/courses" className="text-muted hover:text-ink">{t.nav.courses}</Link>
          <Link href="/become-a-teacher" className="text-muted hover:text-ink">{t.nav.becomeTeacher}</Link>
          <Link href="/help" className="text-muted hover:text-ink">{t.nav.help}</Link>
        </nav>
        <nav aria-label={t.footer.legal} className="flex flex-col gap-2">
          <Link href="/legal/terms" className="text-muted hover:text-ink">{t.footer.terms}</Link>
          <Link href="/legal/privacy" className="text-muted hover:text-ink">{t.footer.privacy}</Link>
          <Link href="/legal/cancellation" className="text-muted hover:text-ink">{t.footer.cancellation}</Link>
        </nav>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-muted">{t.footer.rights} Map data © OpenStreetMap contributors.</p>
    </footer>
  );
}
