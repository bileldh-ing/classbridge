import { forbidden, redirect } from "next/navigation";
import { needsMfa, requireUserPage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

/**
 * Admin area guard (server-side, before any streaming): non-staff get a real HTTP 403; staff without a TOTP-verified
 * session (required in production) are sent to /mfa. Individual pages/actions re-check finer permissions.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage("/admin");
  if (!can(user, "admin.view_dashboard")) forbidden();
  if (needsMfa(user, "admin.view_dashboard")) redirect("/mfa");
  return <>{children}</>;
}
