# Deployment

ClassBridge has **not** been deployed anywhere. This is the checklist for a first production deployment. No Dockerfile or CI workflow is committed yet.

## Topology
- One Next.js 16 Node server (`pnpm build && pnpm start`), stateless apart from the private upload directory.
- Managed PostgreSQL 15+ with contrib extensions `pgcrypto`, `btree_gist`, `cube`, `earthdistance`, `pg_trgm` (most managed providers allow these). The embedded Postgres used in development is not for production.
- A job runner: `pnpm jobs:run --loop` as a separate process (or `pnpm jobs:run` from cron every minute) for hold expiry, email delivery and lesson reminders. Do not rely on request handlers for this.
- Object storage for uploads: the current adapter (`src/lib/storage.ts`) writes to local disk (`STORAGE_DIR`). For multi-instance hosting replace it with S3/Supabase Storage using signed, time-limited URLs.

## Steps
1. Provision Postgres; set `DATABASE_URL` (TLS). Run `pnpm db:migrate` from CI or a release step. **Never run `db:seed` or `db:reset` in production.**
2. Set secrets in the host's secret manager (never in the repo): `AUTH_SECRET` (`openssl rand -hex 32`), provider keys. `NODE_ENV=production`, `APP_URL=https://<domain>` (enables `Secure` cookies). Leave `ENABLE_DEV_OUTBOX` unset/false.
3. Email: verify the sending domain with Resend (SPF/DKIM), set `RESEND_API_KEY`, `EMAIL_FROM`.
4. Payments: Stripe is not available for a Tunisia-registered business (https://stripe.com/global). Use an entity in a supported country or implement a local licensed PSP behind `PaymentProvider`. Register the webhook `https://<domain>/api/payments/webhook/stripe` (events listed in `PAYMENTS_AND_REFUNDS.md`), set `STRIPE_WEBHOOK_SECRET`. Payouts stay disabled until a licensed payout model is verified.
5. Classroom: LiveKit Cloud (or self-hosted with TURN) → `LIVEKIT_URL` (wss), key, secret. `next.config.ts` adds the LiveKit host to CSP `connect-src` at build time, so set it **before** `next build`.
6. Maps: use a commercial/self-hosted tile provider (`NEXT_PUBLIC_MAP_TILE_URL`, attribution) and Mapbox geocoding; public OSM tiles/Nominatim are not for production traffic. `NEXT_PUBLIC_*` values are baked in at build time.
7. Health check: `GET /api/health` → `200 {"status":"ok","db":"ok","providers":{…}}`, `503` when the DB is unreachable.
8. TLS + reverse proxy; forward `X-Forwarded-For` (used for rate limiting).

## Backups and restore
- Enable provider point-in-time recovery; additionally `pg_dump -Fc "$DATABASE_URL" > classbridge-$(date +%F).dump` daily, stored encrypted off-site.
- Restore: `pg_restore --clean --no-owner -d "$DATABASE_URL" classbridge-YYYY-MM-DD.dump`, then `pnpm db:migrate`.
- Back up the private upload storage alongside the database. Financial tables (`orders`, `payment_events`, `teacher_ledger_entries`, `refunds`) must be kept for the legally required period.

## Monitoring
- Structured JSON logs (`src/lib/log.ts`, secrets redacted) → ship to your log platform.
- Not yet integrated: error monitoring (e.g. Sentry with PII scrubbing), uptime alerts, metrics.

## Before go-live (open items)
Admin MFA, nonce-based CSP, malware scanning for uploads, guardian/minor flows (keep adult-only until then), real legal texts, e2e tests in CI, accessibility audit, load test. See `HANDOVER.md`.
