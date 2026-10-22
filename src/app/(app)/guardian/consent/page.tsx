import { requireUserPage } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";

export default async function GuardianConsent({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  await requireUserPage(`/guardian/consent?token=${encodeURIComponent(token)}`);
  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title="Family access request" />
      <Card className="space-y-3">
        <p className="text-sm">If you accept, this person will see your <strong>lesson times, teachers and lesson status</strong> and/or your <strong>course progress</strong>, as they requested. They will not see your messages, payments, notes or contact details. You can revoke access at any time from Family access.</p>
        <div className="flex gap-2">
          <ActionButton endpoint="/api/guardian/consent" body={{ token, decision: "accept" }} label="Accept" redirectTo="/guardian" />
          <ActionButton endpoint="/api/guardian/consent" body={{ token, decision: "decline" }} label="Decline" variant="secondary" redirectTo="/guardian" />
        </div>
      </Card>
    </div>
  );
}
