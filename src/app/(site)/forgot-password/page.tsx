import { getI18n } from "@/lib/i18n/server";
import { ForgotForm } from "@/components/forms/auth-forms";
import { Card } from "@/components/ui";
export const metadata = { title: "Forgot password", robots: { index: false } };
export default async function Page() {
  const { t } = await getI18n();
  return <div className="mx-auto max-w-md px-4 py-12"><h1 className="mb-6 text-2xl font-semibold">{t.auth.forgotTitle}</h1><Card><ForgotForm /></Card></div>;
}
