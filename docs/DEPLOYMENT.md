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

## Container image & CD
- `Dockerfile` (multi-stage, Next standalone, non-root uid 1001, healthcheck on `/api/health/live`). Run `node migrate.mjs` once per release before starting `node server.js`.
- `docker compose up --build` runs postgres:17 → migrate → app locally.
- Tag `vX.Y.Z` → `cd.yml` builds and pushes `ghcr.io/bileldh-ing/classbridge:{X.Y.Z, X.Y, sha}`, creates a GitHub Release with a conventional-commit changelog, then runs the **deploy** job (environment `production`) if one of these secrets is set:
  - **Fly.io:** `FLY_API_TOKEN` (+ `fly.toml` with `release_command = "node migrate.mjs"`, `[[http_service.checks]] path = "/api/health/ready"`).
  - **Render:** `RENDER_DEPLOY_HOOK_URL` (image-backed service; pre-deploy command `node migrate.mjs`).
  - **Vercel:** `VERCEL_TOKEN` (+ project linked; run migrations from CI before deploy; SSE/LISTEN needs a long-lived Node runtime, so prefer a container host for realtime).
- Readiness: point load balancers at `/api/health/ready` (503 until DB reachable and migrations applied); liveness at `/api/health/live`.

## Required production environment
`DATABASE_URL`, `APP_URL` (https), `AUTH_SECRET` (≥32 random chars), `STORAGE_DIR` (persistent volume) — plus optional `SENTRY_DSN`/`SENTRY_ENVIRONMENT`, `LOG_LEVEL`, `ADMIN_MFA_REQUIRED` (default true in production), provider keys (Stripe, LiveKit, Mapbox, Resend). Staff must enrol TOTP at `/mfa` on first admin visit.

## Mobile (Play Store / App Store) {#mobile}
- PWA: installable from the browser (manifest + service worker + offline page).
- Native shells: `capacitor.config.ts` loads `CAP_SERVER_URL` (repository variable). `mobile.yml` builds a debug APK (artifact `classbridge-android-debug-apk`) and an unsigned iOS simulator build.
- Store lanes (`fastlane/Fastfile`), run via `mobile.yml` → *Run workflow* with `release=true`:
  - Android `internal`: secrets `PLAY_STORE_JSON_KEY`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  - iOS `beta` (TestFlight): `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8_BASE64`, `MATCH_GIT_URL`, `MATCH_PASSWORD`, `APPLE_TEAM_ID`.
- Store review note: the apps wrap the web product; keep native value (push notifications, deep links) on the roadmap to satisfy App Store guideline 4.2.

## Release automation
`release-please.yml` maintains a release PR + `CHANGELOG.md` from conventional commits once enabled: turn on *Settings → Actions → Allow GitHub Actions to create and approve pull requests* and set repository variable `RELEASE_PLEASE_ENABLED=true`.
