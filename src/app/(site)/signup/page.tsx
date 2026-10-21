import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { currentUser } from "@/lib/auth/session";
import { SignUpForm } from "@/components/forms/auth-forms";
import { Card } from "@/components/ui";
export const metadata = { title: "Create account", robots: { index: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentUser()) redirect("/dashboard");
  const { t } = await getI18n();
  return <div className="mx-auto max-w-md px-4 py-12"><h1 className="mb-6 text-2xl font-semibold">{t.auth.signUpTitle}</h1><Card><SignUpForm next={next} /></Card></div>;
}
