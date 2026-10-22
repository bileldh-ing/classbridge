import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/security/csp";

/**
 * Per-request CSP nonce for every rendered page (Next.js reads the nonce from the request's CSP header and applies it
 * to its own scripts). Also tags each request with an id for structured logs.
 */
export function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp(nonce, {
    // `next dev` needs eval + websocket HMR; `next start` (production) never does.
    dev: process.env.NODE_ENV === "development",
    livekitUrl: process.env.LIVEKIT_URL,
  });
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-request-id", requestId);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
