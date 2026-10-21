import { getI18n } from "@/lib/i18n/server";
import { Card, LinkButton, PageHeader } from "@/components/ui";
export const metadata = { title: "How it works" };
export default async function Page() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <PageHeader title={t.nav.howItWorks} />
      {[[t.home.step1, t.home.step1Body], [t.home.step2, t.home.step2Body], [t.home.step3, t.home.step3Body]].map(([h, b], i) => <Card key={i}><h2 className="font-semibold">{i + 1}. {h}</h2><p className="mt-1 text-sm text-muted">{b}</p></Card>)}
      <Card><h2 className="font-semibold">{t.home.trustTitle}</h2><p className="mt-1 text-sm text-muted">{t.home.trustBody}</p></Card>
      <LinkButton href="/teachers">{t.nav.findTeachers}</LinkButton>
    </div>
  );
}
