import { getI18n } from "@/lib/i18n/server";
import { env } from "@/lib/env";
import { Card, PageHeader } from "@/components/ui";
export const metadata = { title: "Pricing & fees" };
export default async function Page() {
  const { t } = await getI18n();
  const pct = (env().PLATFORM_FEE_BPS / 100).toFixed(1).replace(/\.0$/, "");
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <PageHeader title={t.nav.pricing} />
      <Card><h2 className="font-semibold">Students</h2><p className="mt-1 text-sm text-muted">You pay the lesson price shown on the teacher&apos;s profile, in the teacher&apos;s currency. Free trial lessons cost nothing. Prices and the cancellation policy are fixed at the moment you book.</p></Card>
      <Card><h2 className="font-semibold">Teachers</h2><p className="mt-1 text-sm text-muted">ClassBridge records a platform fee of {pct}% of each paid lesson in your earnings ledger. Provider processing fees depend on the payment provider. Payouts require provider onboarding and are not yet enabled on this deployment.</p></Card>
    </div>
  );
}
