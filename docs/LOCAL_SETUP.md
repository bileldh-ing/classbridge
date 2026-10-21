# Local setup

## Prerequisites
- Node.js 22 and pnpm (lockfile: `pnpm-lock.yaml`).
- No Docker or system PostgreSQL is needed: `pnpm db:start` runs real PostgreSQL 17 binaries from the `embedded-postgres` package. You can instead point `DATABASE_URL` at any PostgreSQL 15+ server that has the contrib extensions `pgcrypto`, `btree_gist`, `cube`, `earthdistance`, `pg_trgm` as used in `drizzle/0000_extensions.sql`.
- ~2 GB free RAM for `next build`. On small machines set `NODE_OPTIONS=--max-old-space-size=1536` and run heavy commands one at a time.

## 1. Install and configure
```bash
pnpm install
cp .env.example .env.local
openssl rand -hex 32   # paste into AUTH_SECRET
```
`src/lib/env.ts` validates the environment with Zod at startup (in production a missing `AUTH_SECRET` is a hard error).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection (default embedded server `postgres://classbridge:classbridge@127.0.0.1:54329/classbridge`) |
| `APP_URL` | yes | Public base URL for emails, Stripe redirects, certificate links |
| `AUTH_SECRET` | yes (prod) | ≥32 chars, HMAC for tokens |
| `BOOKING_HOLD_MINUTES` | no (10) | checkout slot-hold window |
| `PLATFORM_FEE_BPS` | no (1500) | platform fee in basis points |
| `STORAGE_DIR` | no | private upload directory (never served publicly) |
| `ENABLE_DEV_OUTBOX` | no (false) | shows `/dev/outbox` with unsent emails — **development only** |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | optional | payments (see PAYMENTS_AND_REFUNDS.md) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | optional | live classroom (see CLASSROOM.md) |
| `MAPBOX_ACCESS_TOKEN`, `MAPBOX_PERMANENT_GEOCODING` | optional | geocoding (preferred) |
| `NOMINATIM_CONTACT_EMAIL` | optional | enables OSM Nominatim (≤1 req/s, no autocomplete) |
| `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | optional | map tiles + attribution |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | outbound email |

When an optional provider is not configured the app says so (UI notice, HTTP 503 with a `*_NOT_CONFIGURED` code, and `/api/health` → `providers`). Nothing is faked.

## 2. Database
```bash
pnpm db:start      # starts PostgreSQL on 127.0.0.1:54329, data in ./.pgdata, creates classbridge + classbridge_test
pnpm db:migrate    # applies drizzle/0000_extensions.sql, 0001_init.sql, 0002_constraints.sql
pnpm db:seed       # demo data (labelled "(Demo)"), dev only
pnpm db:reset      # drop + migrate + seed (refuses when NODE_ENV=production)
pnpm db:stop
```
The embedded server runs with `fsync=off` for speed in dev/test; set `PG_DURABLE=1` to disable that. To stop it manually: `kill $(head -1 .pgdata/postmaster.pid)`.

Schema changes: edit `src/lib/db/schema.ts`, run `pnpm db:generate` to create a new SQL migration in `/drizzle`, review it, commit it, then `pnpm db:migrate`.

## 3. Run
```bash
pnpm dev                 # development server, http://localhost:3000
pnpm build && pnpm start # production build
pnpm jobs:run            # background jobs once (hold expiry, email delivery, 24h/1h reminders); add --loop to keep running
```
Without an email provider, set `ENABLE_DEV_OUTBOX=true` and open `/dev/outbox` to follow verification/reset links.

## 4. Providers (optional)
- **Stripe** (test mode first): set keys, then `stripe listen --forward-to localhost:3000/api/payments/webhook/stripe`. Stripe is not available to Tunisia-registered businesses (https://stripe.com/global).
- **LiveKit**: LiveKit Cloud project or self-hosted server; copy URL/key/secret.
- **Mapbox**: access token; only set `MAPBOX_PERMANENT_GEOCODING=true` if your plan allows permanent storage.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Integration DB unavailable` in tests | `pnpm db:start` first |
| `next build` says "Failed to type check" with no errors | the type-check worker was OOM-killed; free memory and rerun (`pnpm typecheck` shows real errors) |
| ESLint killed on low memory | lint folders separately: `npx eslint --cache src/lib`, etc. |
| Port 54329 in use | another embedded server is running; check `.pgdata/postmaster.pid` |
| `/dev/outbox` 404 | `ENABLE_DEV_OUTBOX` is not `true` |
