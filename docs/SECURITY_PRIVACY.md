# Security & privacy

## Threat model (summary)
| Asset | Threat | Control (implemented) |
|---|---|---|
| Accounts | credential stuffing, enumeration | argon2id hashes; generic login errors + dummy hash verify for unknown emails; DB rate limits (login per IP & per email, signup, forgot, reset, verify); forgot-password always returns 200 |
| Sessions | theft, fixation, CSRF | 256-bit random token in `httpOnly`, `SameSite=Lax`, `Secure` (when APP_URL is https) cookie; only SHA-256 stored; revocation (logout, logout-others, password change/reset, suspension); Origin check on all cookie-authenticated mutations; Server Actions not used for mutations |
| Bookings | double booking, tampering with price | DB exclusion constraint; price/currency/fee/policy snapshotted server-side from the offering; client never sends amounts; state machine + compare-and-set updates |
| Private data | IDOR / cross-user reads | every service loads the object and checks participant/owner/staff; non-visible objects return 404; integration tests cover cross-user booking, messaging, classroom, course content |
| Payments | forged webhooks, replay, amount mismatch | Stripe signature verification on raw body (300 s tolerance); `(provider,event_id)` unique; amount/currency must match the stored intent; ledger/notification/email idempotency keys |
| Classroom | uninvited join | token only for booking participants, confirmed/in-progress online lessons, inside [start−10 min, end+15 min]; room names random; TTL ≤ 10 min; least-privilege grant; denials logged |
| Uploads | malware / XSS via files | magic-byte allow-list (PDF/PNG/JPEG), 5 MB cap, random file names outside any public directory, served only through an authorised route with `Content-Disposition: attachment`, `nosniff`, `CSP: sandbox`; staff access audited. **No malware scanning** (not available in this environment) |
| Admin | privilege abuse | explicit permission matrix (`src/lib/auth/permissions.ts`), reason required, append-only `audit_log` (DB trigger rejects UPDATE/DELETE), support role cannot verify teachers or refund |
| Location | stalking | only approximate positions are public (2 km grid or city centre); radius search uses approximate points; private visibility removes the pin; precise coordinates stored only with consent + provider permission and never returned by any API |
| Content | XSS | React escaping; no `dangerouslySetInnerHTML`; map popups built with DOM text nodes; external links `rel="noopener noreferrer nofollow"` |
| Headers | clickjacking, sniffing | CSP (see gaps), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `poweredByHeader: false` |

## Authorization matrix (application layer — this build uses plain PostgreSQL, not Supabase RLS)
| Resource | Anonymous | Student | Teacher | Support | Admin |
|---|---|---|---|---|---|
| Published teacher profile / courses | read | read | read | read | read |
| Draft profiles / courses | – | – | own | – | via admin queue |
| Booking | – | own | own (as teacher) | read | read, cancel |
| Booking events / notes | – | own (notes visible to student) | own | read | read |
| Messages | – | member only | member only | – | – (no backdoor) |
| Classroom token | – | participant | participant | – | – |
| Teacher credentials file | – | – | own | – | verifier (audited) |
| Ledger / earnings | – | – | own | – | read (payments views) |
| Audit log | – | – | – | – | read |

**RLS**: not used because there is no client-side database access (no Supabase/PostgREST); the browser only talks to the Next.js server, which uses one DB role. If Supabase is adopted later, enable RLS on every exposed table and revoke default grants (see spec §6).

## Data minimisation & retention
- No date of birth or identity documents are required; an 18+ self-declaration is recorded at signup (`profiles.is_adult_confirmed`). **Minor/guardian flows are not implemented** — keep the market adult-only until guardian consent is built.
- Consents (terms/privacy/marketing) stored with version + timestamp; marketing is opt-in (default false); recording is not offered.
- Live audio/video is never stored; LiveKit chat/hand-raise is ephemeral (data messages).
- Logs are structured JSON with key-based redaction of passwords/tokens/secrets/cookies/signatures; message bodies are not logged.
- Privacy requests (export/deletion) are recorded (`privacy_requests`) for staff handling; deletion request deactivates the account immediately. Financial records (orders, ledger, payment events) must be retained per accounting law and are excluded from deletion. **Automated export/erasure jobs are not implemented.**

## Hardening in place (22 Oct 2026)
- **Staff 2FA:** TOTP (RFC 6238) for admin/support; secret AES-256-GCM encrypted at rest (key derived from `AUTH_SECRET`), replay-protected, verified per session; staff permissions return `MFA_REQUIRED` until verified. Required by default in production (`ADMIN_MFA_REQUIRED`).
- **CSP:** per-request nonce + `strict-dynamic` for scripts (no `unsafe-inline`/`unsafe-eval` in production), `frame-ancestors 'none'`, `object-src 'none'`, `upgrade-insecure-requests` on HTTPS; APIs get `default-src 'none'`. Plus HSTS (https), XFO DENY, nosniff, COOP/CORP, Permissions-Policy.
- **Admin pages:** non-staff receive a real HTTP 403 (`forbidden()`); APIs 401/403 as before.
- **Uploads:** credentials and message attachments are type-checked by magic bytes, size-capped (5 MiB), stored under random keys in private storage, served only through membership/ownership-checked routes as sandboxed attachments.
- **Rate limits:** login, signup, booking, messages, tickets, replies, MFA, guardian requests, announcements (Postgres fixed window, multi-instance safe).
- **Monitoring:** optional Sentry-compatible reporting with PII scrubbing (no query strings, cookies, bodies; emails masked; sensitive keys redacted); structured JSON logs with request ids.
- **Guardians & minors:** guardian access only after the learner's explicit consent (recorded with policy version), read-only and revocable; minors' accounts stay disabled (`minor_accounts` flag off; signup is 18+).

## Known gaps (must close before production)
- Malware scanning of uploads (hook point: `putPrivateFile` in `src/lib/storage.ts`; e.g. ClamAV sidecar or provider scanning).
- Local-disk storage: implement an S3/R2 adapter with short-lived signed URLs for multi-instance deployments.
- `style-src 'unsafe-inline'` remains (inline style attributes from React/Leaflet); scripts are nonce-only.
- Legal texts are placeholders; DPA/processor list to be written per launch country.
- Data export/erasure requests are recorded but processed manually.

## Incident response (outline)
Revoke sessions (`UPDATE sessions SET revoked_at = now()`), rotate `AUTH_SECRET`/provider keys, suspend affected accounts via admin UI (audited), export `audit_log` and `provider_webhook_events` for investigation, notify users/regulators as required.
