/**
 * Strict, nonce-based Content Security Policy (built per request in src/proxy.ts).
 * Scripts: only 'self' + the per-request nonce, with 'strict-dynamic' so Next.js chunks loaded by trusted scripts run.
 * Styles keep 'unsafe-inline' because React `style` props and Leaflet render inline style attributes; style injection
 * cannot execute script, and adding a nonce here would make browsers ignore 'unsafe-inline'.
 * Edge-safe: no Node imports.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; livekitUrl?: string; https?: boolean }) {
  const lk = opts.livekitUrl ?? "";
  const connect = ["'self'", lk, lk.replace(/^wss:/, "https:"), "https://checkout.stripe.com"].filter(Boolean);
  if (opts.dev) connect.push("ws:", "wss:");
  else if (lk) connect.push("wss:");
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://api.mapbox.com",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "object-src 'none'",
  ];
  // Only when served over HTTPS: on plain-http hosts (local e2e) it would break same-origin asset loads.
  if (!opts.dev && opts.https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
