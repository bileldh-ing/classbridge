import { getI18n } from "@/lib/i18n/server";
import { ResetForm } from "@/components/forms/auth-forms";
import { Alert, Card } from "@/components/ui";
export const metadata = { title: "Reset password", robots: { index: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getI18n();
  return <div className="mx-auto max-w-md px-4 py-12"><h1 className="mb-6 text-2xl font-semibold">{t.auth.resetTitle}</h1><Card>{token ? <ResetForm token={token} /> : <Alert tone="error">{t.auth.verifyFail}</Alert>}</Card></div>;
}
