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

## Known gaps (must close before production)
1. CSP uses `'unsafe-inline'` for scripts (Next.js bootstrap) — move to nonce-based CSP.
2. Admin MFA is not implemented.
3. No malware scanning for uploads; local-disk storage adapter (use S3/Supabase Storage with signed URLs).
4. No error-monitoring integration (Sentry etc.).
5. Rate limiter is a fixed window in Postgres (fine for moderate traffic; consider Redis).
6. Legal texts are placeholders.

## Incident response (outline)
Revoke sessions (`UPDATE sessions SET revoked_at = now()`), rotate `AUTH_SECRET`/provider keys, suspend affected accounts via admin UI (audited), export `audit_log` and `provider_webhook_events` for investigation, notify users/regulators as required.
