/**
 * Structured JSON logs (one line per event, stdout/stderr) with level filtering (LOG_LEVEL) and key-based redaction.
 * Never pass passwords, tokens, message bodies or payment secrets; anything with a sensitive key name is redacted
 * and email addresses inside string values are masked.
 */
const REDACT = /(password|token|secret|authorization|cookie|signature|totp|body)/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

export function scrubValue(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.replace(EMAIL, "$1***@$2").slice(0, 2000);
  if (Array.isArray(v)) return depth > 3 ? "[array]" : v.slice(0, 50).map((x) => scrubValue(x, depth + 1));
  if (v && typeof v === "object") return depth > 3 ? "[object]" : scrub(v as Record<string, unknown>, depth + 1);
  return v;
}
export function scrub(meta: Record<string, unknown> = {}, depth = 0): Record<string, unknown> {
  return Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : scrubValue(v, depth)]));
}

function threshold(): number {
  const l = (process.env.LOG_LEVEL ?? "info") as Level;
  return LEVELS[l] ?? LEVELS.info;
}

function out(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), service: "classbridge", ...scrub(meta) });
  if (level === "error" || level === "warn") console.error(line); else console.log(line);
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => out("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => out("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => out("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => out("error", m, meta),
};
