import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { listFlags } from "@/lib/services/flags";
import { Badge, Card, PageHeader } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";
import { allowed, Denied } from "../guard";

export default async function AdminFlags() {
  const user = await requireUserPage("/admin/flags");
  if (!allowed(user, "admin.manage_flags")) Denied();
  const flags = await listFlags(getDb());
  return (
    <div className="space-y-4">
      <PageHeader title="Feature flags" subtitle="Every change requires a reason and is written to the audit log." />
      <div className="grid gap-3 md:grid-cols-2">{flags.map((f) => (
        <Card key={f.key} data-testid={`flag-${f.key}`}>
          <div className="mb-1 flex items-center justify-between"><code className="text-sm font-semibold">{f.key}</code><Badge tone={f.enabled ? "success" : "neutral"}>{f.enabled ? "on" : "off"}</Badge></div>
          <p className="mb-2 text-sm text-muted">{f.description}</p>
          <JsonForm endpoint={`/api/admin/flags/${f.key}`} submitLabel={f.enabled ? "Turn off" : "Turn on"} extra={{ enabled: !f.enabled }} fields={[{ name: "reason", label: "Reason", required: true }]} />
        </Card>))}</div>
    </div>
  );
}
