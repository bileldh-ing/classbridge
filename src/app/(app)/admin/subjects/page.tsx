import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { listTaxonomy } from "@/lib/services/moderation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { JsonForm } from "@/components/client/json-form";
import { ActionButton as ActionToggle } from "@/components/client/action-button";
import { allowed, Denied } from "../guard";

export default async function AdminSubjects() {
  const user = await requireUserPage("/admin/subjects");
  if (!allowed(user, "admin.manage_subjects")) Denied();
  const tax = await listTaxonomy(getDb());
  return (
    <div className="space-y-4">
      <PageHeader title="Subjects & categories" subtitle="Inactive subjects stay on existing profiles but are hidden from filters. Changes are audited." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">New category</h2>
          <JsonForm endpoint="/api/admin/taxonomy/categories" submitLabel="Add category" fields={[
            { name: "slug", label: "Slug (a-z, 0-9, -)", required: true }, { name: "nameEn", label: "Name (English)", required: true },
            { name: "nameFr", label: "Name (French)", required: true }, { name: "nameAr", label: "Name (Arabic)", required: true },
            { name: "sortOrder", label: "Sort order", type: "number", defaultValue: 10 }, { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
          ]} /></Card>
        <Card><h2 className="mb-2 font-semibold">New subject</h2>
          <JsonForm endpoint="/api/admin/taxonomy/subjects" submitLabel="Add subject" fields={[
            { name: "categoryId", label: "Category", type: "select", options: tax.map((c) => ({ value: c.id, label: c.nameEn })) },
            { name: "slug", label: "Slug", required: true }, { name: "nameEn", label: "Name (English)", required: true },
            { name: "nameFr", label: "Name (French)", required: true }, { name: "nameAr", label: "Name (Arabic)", required: true },
            { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
          ]} /></Card>
      </div>
      {tax.map((c) => (
        <Card key={c.id}>
          <h2 className="font-semibold">{c.nameEn} <span className="text-sm font-normal text-muted">/ {c.nameFr} / {c.nameAr}</span> {!c.isActive && <Badge>inactive</Badge>}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">{c.subjects.map((s) => (
            <li key={s.id} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-sm">{s.nameEn} <code className="text-xs text-muted">{s.slug}</code>
              <ToggleSubject s={s} />
            </li>))}</ul>
        </Card>))}
    </div>
  );
}

function ToggleSubject({ s }: { s: { id: string; slug: string; nameEn: string; nameFr: string; nameAr: string; categoryId: string; isActive: boolean } }) {
  return <ActionToggle endpoint={`/api/admin/taxonomy/subjects/${s.id}`} body={{ slug: s.slug, nameEn: s.nameEn, nameFr: s.nameFr, nameAr: s.nameAr, categoryId: s.categoryId, isActive: !s.isActive }} label={s.isActive ? "Deactivate" : "Activate"} />;
}
