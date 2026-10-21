/** Structured JSON logs. Never pass passwords, tokens, message bodies or payment secrets. */
const REDACT = /(password|token|secret|authorization|cookie|signature)/i;
function scrub(meta: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : v]));
}
function out(level: string, msg: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  console[level === "error" ? "error" : "log"](JSON.stringify({ level, msg, time: new Date().toISOString(), ...scrub(meta) }));
}
export const log = {
  info: (m: string, meta?: Record<string, unknown>) => out("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => out("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => out("error", m, meta),
};
