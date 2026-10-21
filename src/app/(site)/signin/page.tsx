import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { currentUser } from "@/lib/auth/session";
import { SignInForm } from "@/components/forms/auth-forms";
import { Card } from "@/components/ui";
export const metadata = { title: "Sign in", robots: { index: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentUser()) redirect(next?.startsWith("/") ? next : "/dashboard");
  const { t } = await getI18n();
  return <div className="mx-auto max-w-md px-4 py-12"><h1 className="mb-6 text-2xl font-semibold">{t.auth.signInTitle}</h1><Card><SignInForm next={next} /></Card></div>;
}
