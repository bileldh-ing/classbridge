import { getI18n } from "@/lib/i18n/server";
import { Card, PageHeader } from "@/components/ui";
export const metadata = { title: "Help centre" };
export default async function Page() {
  const { t } = await getI18n();
  const faqs: Array<[string, string]> = [
    [t.home.faq1q, t.home.faq1a], [t.home.faq2q, t.home.faq2a], [t.home.faq3q, t.home.faq3a],
    ["When can I join my lesson?", "The Join button appears 10 minutes before the start and works until 15 minutes after the end. Only the student and teacher of the booking can join."],
    ["How do I report a problem?", "Use “Report” on a profile, review or message. Our moderation team reviews every report; reports never hide content automatically."],
    ["How do I delete my account or export my data?", "Go to Settings → Privacy & data. Financial records may be kept for legal retention periods."],
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title={t.nav.help} />
      <div className="space-y-2">{faqs.map(([q, a]) => <details key={q} className="rounded-lg border border-line p-4"><summary className="cursor-pointer font-medium">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>)}</div>
      <Card className="mt-6"><p className="text-sm">Support contact will be configured by the operator before launch.</p></Card>
    </div>
  );
}
