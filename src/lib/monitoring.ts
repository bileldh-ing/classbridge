/**
 * Error monitoring adapter. When SENTRY_DSN is set, exceptions are sent to Sentry's envelope endpoint over HTTPS
 * (no SDK dependency); otherwise they are only logged. Events are PII-scrubbed: no cookies, headers, request bodies,
 * query strings or user emails; only the user id (if known), route path and a scrubbed message/stack.
 */
import { randomUUID } from "node:crypto";
import { log, scrub, scrubValue } from "./log";

type Ctx = { route?: string; method?: string; userId?: string; digest?: string; extra?: Record<string, unknown> };

export function parseDsn(dsn: string) {
  const u = new URL(dsn);
  const projectId = u.pathname.replace(/^\//, "");
  if (!u.username || !projectId) throw new Error("invalid DSN");
  return { publicKey: u.username, host: u.host, protocol: u.protocol, projectId, envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/` };
}

/** Builds the Sentry event payload (exported for tests). */
export function buildEvent(err: unknown, ctx: Ctx = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  const frames = (e.stack ?? "").split("\n").slice(1, 30).map((l) => ({ function: String(scrubValue(l.trim())) })).reverse();
  return {
    event_id: randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.APP_VERSION ?? undefined,
    exception: { values: [{ type: e.name, value: String(scrubValue(e.message)), stacktrace: { frames } }] },
    // Path only: query strings can carry tokens.
    request: ctx.route ? { url: ctx.route.split("?")[0], method: ctx.method } : undefined,
    user: ctx.userId ? { id: ctx.userId } : undefined,
    tags: { digest: ctx.digest },
    extra: ctx.extra ? scrub(ctx.extra) : undefined,
  };
}

export async function captureException(err: unknown, ctx: Ctx = {}) {
  log.error("exception", { err: err instanceof Error ? err.message : String(err), route: ctx.route?.split("?")[0], digest: ctx.digest });
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const d = parseDsn(dsn);
    const ev = buildEvent(err, ctx);
    const body = `${JSON.stringify({ event_id: ev.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(ev)}`;
    await fetch(d.envelopeUrl, {
      method: "POST", body, signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=classbridge/1.0, sentry_key=${d.publicKey}` },
    });
  } catch (e) {
    log.warn("monitoring_send_failed", { err: e instanceof Error ? e.message : String(e) });
  }
}
