import { requireUserPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { Alert, LinkButton } from "@/components/ui";

/** Teacher area guard: the teacher capability is required (server-side, not just hidden links). */
export default async function TeachLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage("/teach");
  const { t } = await getI18n();
  if (!user.roles.includes("teacher")) {
    return <Alert tone="warn" title={t.common.forbidden}><p className="mb-2">{t.home.teacherCtaBody}</p><LinkButton href="/become-a-teacher">{t.nav.becomeTeacher}</LinkButton></Alert>;
  }
  return <>{children}</>;
}
