import type { DbOrTx } from "../db";
import { notifications } from "../db/schema";

/** In-app notification, de-duplicated per user by dedupeKey (webhook replays never duplicate). */
export async function notify(db: DbOrTx, n: { userId: string; kind: string; title: string; body?: string; link?: string; dedupeKey: string }) {
  await db.insert(notifications).values({
    userId: n.userId, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link ?? null, dedupeKey: n.dedupeKey,
  }).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] });
}
