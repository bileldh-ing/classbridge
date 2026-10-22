/**
 * Realtime fan-out over PostgreSQL LISTEN/NOTIFY. A single dedicated connection per app instance LISTENs on
 * `cb_messages` (fed by the messages_notify trigger) and dispatches to in-process subscribers (SSE streams).
 * Works across instances because every instance listens to the same channel. Membership is checked by the
 * SSE route BEFORE subscribing; payloads only carry ids, clients refetch through the authorised API.
 */
import { Client } from "pg";
import { EventEmitter } from "node:events";
import { env } from "./env";
import { log } from "./log";

type G = { __cbRealtime?: { emitter: EventEmitter; client: Client | null; connecting: Promise<void> | null } };
const g = globalThis as unknown as G;

function state() {
  if (!g.__cbRealtime) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(10_000);
    g.__cbRealtime = { emitter, client: null, connecting: null };
  }
  return g.__cbRealtime;
}

async function ensureListening() {
  const s = state();
  if (s.client) return;
  if (s.connecting) return s.connecting;
  s.connecting = (async () => {
    const client = new Client({ connectionString: env().DATABASE_URL });
    client.on("notification", (n) => {
      if (n.channel !== "cb_messages" || !n.payload) return;
      try { const p = JSON.parse(n.payload) as { c: string; m: string }; s.emitter.emit(`conv:${p.c}`, { messageId: p.m }); } catch { /* ignore */ }
    });
    client.on("error", (e) => { log.warn("realtime_listener_error", { err: e.message }); s.client = null; client.end().catch(() => {}); });
    await client.connect();
    await client.query("LISTEN cb_messages");
    s.client = client;
  })().finally(() => { s.connecting = null; });
  return s.connecting;
}

export async function subscribeConversation(conversationId: string, fn: (e: { messageId: string }) => void) {
  await ensureListening();
  const s = state();
  s.emitter.on(`conv:${conversationId}`, fn);
  return () => { s.emitter.off(`conv:${conversationId}`, fn); };
}
