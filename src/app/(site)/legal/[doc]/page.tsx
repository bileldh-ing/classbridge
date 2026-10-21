import { notFound } from "next/navigation";
import { POLICIES } from "@/lib/policy/cancellation";
import { POLICY_VERSIONS } from "@/lib/validation/auth";
import { Alert, Card, PageHeader } from "@/components/ui";

const DOCS: Record<string, { title: string; body: string[] }> = {
  terms: { title: "Terms of Service", body: ["ClassBridge connects learners with independent teachers. Teachers are responsible for the lessons they deliver.", "Bookings are confirmed only after a verified payment (or for free lessons, explicit confirmation).", "Users must not harass others, misrepresent credentials or circumvent the platform's safety rules."] },
  privacy: { title: "Privacy Policy", body: ["We store the minimum data needed to run lessons: account details, bookings, messages and payment references (never card numbers).", "Teacher locations are shown only as approximate areas. Live lessons are not recorded.", "You can request a data export or account deletion from Settings. Financial records follow legal retention periods."] },
  cancellation: { title: "Cancellation Policy", body: Object.values(POLICIES).map((p) => `${p.id}: ${p.summary}`) },
};

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title={d.title} subtitle={`Version ${POLICY_VERSIONS.terms}`} />
      <Alert tone="warn" className="mb-4">Draft placeholder text for development. It must be replaced by legally reviewed documents before launch.</Alert>
      <Card className="space-y-3 text-sm">{d.body.map((p, i) => <p key={i}>{p}</p>)}</Card>
    </div>
  );
}
