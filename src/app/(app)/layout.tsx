import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { AppShell } from "@/components/layout/app-shell";
import { requireUserPage } from "@/lib/auth/session";

// Private dashboards are never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();
  return (<><SiteHeader /><AppShell user={user}>{children}</AppShell></>);
}
