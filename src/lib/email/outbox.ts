import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { DbOrTx, DB } from "../db";
import { emailOutbox } from "../db/schema";
import { env } from "../env";
import { getEmailProvider, type EmailProvider } from "./provider";

/** Enqueue (idempotent by key). Sending happens in deliverPendingEmails (job runner / best-effort after commit). */
export async function enqueueEmail(db: DbOrTx, m: { to: string; userId?: string | null; template: string; subject: string; body: string; idempotencyKey: string }) {
  await db.insert(emailOutbox).values({
    toEmail: m.to, userId: m.userId ?? null, template: m.template, subject: m.subject, body: m.body, idempotencyKey: m.idempotencyKey,
  }).onConflictDoNothing({ target: emailOutbox.idempotencyKey });
}

export async function deliverPendingEmails(db: DB, provider: EmailProvider | null = getEmailProvider(), limit = 20) {
  const rows = await db.select().from(emailOutbox)
    .where(and(inArray(emailOutbox.status, ["queued", "failed"]), lte(emailOutbox.sendAfter, new Date()), sql`${emailOutbox.attempts} < 5`))
    .limit(limit);
  let sent = 0;
  for (const r of rows) {
    if (!provider) {
      // Honest state: never mark as sent without a provider.
      await db.update(emailOutbox).set({ status: env().ENABLE_DEV_OUTBOX ? "dev_logged" : "not_configured" }).where(eq(emailOutbox.id, r.id));
      continue;
    }
    try {
      const res = await provider.send({ to: r.toEmail, subject: r.subject, text: r.body, idempotencyKey: r.idempotencyKey });
      await db.update(emailOutbox).set({ status: "sent", sentAt: new Date(), providerMessageId: res.providerMessageId, attempts: r.attempts + 1 }).where(eq(emailOutbox.id, r.id));
      sent++;
    } catch (e) {
      const backoffMin = 2 ** r.attempts;
      await db.update(emailOutbox).set({
        status: "failed", attempts: r.attempts + 1, lastError: String(e).slice(0, 500),
        sendAfter: new Date(Date.now() + backoffMin * 60_000),
      }).where(eq(emailOutbox.id, r.id));
    }
  }
  return { processed: rows.length, sent };
}
