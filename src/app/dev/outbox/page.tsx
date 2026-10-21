import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/**
 * DEVELOPMENT ONLY (ENABLE_DEV_OUTBOX=true): shows queued emails so verification/reset links can be followed
 * without an email provider. Returns 404 otherwise. Never enable in production.
 */
export default async function DevOutbox() {
  if (!env().ENABLE_DEV_OUTBOX) notFound();
  const rows = await getDb().select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(30);
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold">Developer email outbox</h1>
      <p className="mb-4 rounded bg-amber-50 p-2 text-sm text-amber-900">No email provider is configured. These messages were NOT sent. This page exists only because ENABLE_DEV_OUTBOX=true.</p>
      <ul className="space-y-3">{rows.map((r) => (
        <li key={r.id} className="rounded border border-gray-200 p-3 text-sm"><p><strong>{r.subject}</strong> → {r.toEmail} <span className="text-gray-500">[{r.status}]</span></p>
          <pre className="mt-2 whitespace-pre-wrap break-all font-sans">{r.body}</pre></li>))}</ul>
    </main>
  );
}
