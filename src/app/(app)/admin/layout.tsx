import { requireUserPage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getI18n } from "@/lib/i18n/server";
import { Alert } from "@/components/ui";

/** Admin area guard (server-side). Individual pages/actions re-check finer permissions. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage("/admin");
  const { t } = await getI18n();
  if (!can(user, "admin.view_dashboard")) return <Alert tone="error" title={t.common.forbidden}>This area is restricted to platform staff.</Alert>;
  return <>{children}</>;
}
