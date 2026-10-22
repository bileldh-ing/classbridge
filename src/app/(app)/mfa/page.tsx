import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";
import { Card, PageHeader } from "@/components/ui";
import { MfaSetup } from "@/components/client/mfa";
import { JsonForm } from "@/components/client/json-form";

/** Staff two-factor: enroll (secret shown once) or verify this session. */
export default async function MfaPage() {
  const user = await requireUserPage("/mfa");
  if (!isStaff(user)) redirect("/dashboard");
  if (user.mfaVerified) redirect("/admin");
  return (
    <div className="max-w-lg space-y-4">
      <PageHeader title="Two-factor authentication" subtitle="Staff tools require a code from an authenticator app (TOTP) for each session." />
      <Card>
        {user.mfaEnabled
          ? <JsonForm testId="mfa-verify" endpoint="/api/auth/mfa/verify" submitLabel="Verify" fields={[{ name: "code", label: "6-digit code", required: true, placeholder: "123456" }]} />
          : <MfaSetup />}
      </Card>
    </div>
  );
}
