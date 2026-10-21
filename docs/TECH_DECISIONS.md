# Technical decisions

Recorded 21 October 2026. Versions are pinned in `package.json` / `pnpm-lock.yaml`.

| Area | Choice (version) | Why | Alternatives considered |
|---|---|---|---|
| Runtime | Node.js 22 (linux arm64 sandbox) | Available LTS in the build environment | — |
| Package manager | pnpm (lockfile committed) | Fast, strict; `pnpm-workspace.yaml` allow-lists native build scripts | npm |
| Web framework | **Next.js 16.4.2** (App Router), React 19.3.1 | Current stable; RSC for data pages, Route Handlers for the typed API | Remix, separate API server |
| Language | TypeScript 5.9.3 | TS 7 (native) is `latest` on npm but Next 16 tooling targets TS 5.x; 5.9 is the newest 5.x | TS 7.0 |
| Styling | Tailwind CSS 4.3 + small hand-written shadcn-style kit (`src/components/ui`) + lucide-react | Accessible, consistent, no generated component dump | shadcn CLI (needs network templates/radix deps; not required) |
| Forms | react-hook-form 7.90 + zod 4 (`@hookform/resolvers` 6) | Same Zod schemas validate on client and server | Formik |
| Database | **PostgreSQL 17** | System of record per spec | — |
| Local Postgres | `embedded-postgres` 17.10.0-beta.17 (real PG binaries for linux-arm64) | No Docker/root/system Postgres in this sandbox. The npm package only publishes `-beta` tags; the binaries are upstream PostgreSQL 17.x | Docker postgres (unavailable) |
| ORM / migrations | **Drizzle ORM 0.45.4 + drizzle-kit 0.31** with committed SQL in `/drizzle` | Typed queries, raw SQL where needed, SQL migrations reviewable in Git | Prisma |
| Geospatial | **earthdistance + cube** (contrib) with GiST index | **PostGIS is not shipped with embedded-postgres** (verified: only btree_gist, cube, earthdistance, pg_trgm etc. present). earthdistance gives indexed radius search (`earth_box` + `earth_distance`) which is sufficient for "teachers within N km" | PostGIS (switch is straightforward in production; see MAPS doc) |
| Text search | Postgres FTS (`simple` config, multilingual) + `pg_trgm` | No external search engine needed at this scale | Meilisearch/Elastic |
| Double-booking | `EXCLUDE USING gist (teacher_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` (btree_gist) on slot-occupying statuses | Database-level guarantee even under concurrent requests | Advisory locks only |
| Auth | **Custom, documented**: argon2id (`@node-rs/argon2`, OWASP params m=19 MiB t=2 p=1), DB sessions (random 256-bit token in httpOnly SameSite=Lax cookie, only SHA-256 stored), hashed single-use email-verification/reset tokens, DB-backed rate limiting | Supabase is unavailable (no credentials). A small, fully tested design avoids a dependency whose adapters would still need a custom schema | Auth.js / better-auth |
| Payments | **Stripe** (`stripe` 23.0.0) behind `PaymentProvider`/`RefundProvider`/`PayoutProvider` interfaces; Checkout Sessions + signed webhooks | Spec option; webhook signature verification and idempotency fully implemented and tested with locally signed events | Paymob/Konnect/Flouci for Tunisia (no adapter yet) |
| Video | **LiveKit** (`livekit-server-sdk` 2.19.1 for tokens, `livekit-client` for the room UI) | Private rooms, short-lived room-scoped JWT grants | Daily, Twilio |
| Maps | **Leaflet 1.9.4 + leaflet.markercluster** with OpenStreetMap tiles (attribution shown; tile URL configurable) | Keyless; clustering; replaceable via `NEXT_PUBLIC_MAP_TILE_URL` | Mapbox GL (needs token) / MapLibre |
| Geocoding | `GeocodingProvider` adapter: **Mapbox Geocoding v6** (if `MAPBOX_ACCESS_TOKEN`) or **Nominatim** (only if `NOMINATIM_CONTACT_EMAIL`, user-triggered, ≤1 req/s, no autocomplete). Fallback: seeded city list (manual selection) | Never invent coordinates; honest fallback when no provider | Google Maps Platform |
| Email | `EmailProvider` adapter: **Resend** HTTP API (if `RESEND_API_KEY` + `EMAIL_FROM`); `email_outbox` table with idempotency keys and retries; dev-only `/dev/outbox` viewer behind `ENABLE_DEV_OUTBOX=true` | No silent "sent" without a provider | SES, Postmark |
| Time | Luxon 3.7 for DST-safe wall-clock → UTC conversion | Well-tested IANA handling | date-fns-tz |
| i18n | Own lightweight dictionaries (EN/FR/AR, type-checked completeness) + `<html lang dir>` + logical CSS properties for RTL | Cookie-based locale, no URL prefixes needed; avoids framework coupling | next-intl |
| Tests | Vitest 5 (unit + integration against real Postgres) | Fast, TS-native | Jest |
| E2E | Playwright — **blocked**: `npx playwright install chromium` got HTTP 403 for the linux-arm64 Chrome for Testing build (21 Oct 2026); see TESTING.md | — | — |

## Provider eligibility research (checked 21 Oct 2026)
- **Stripe** — the official availability page (https://stripe.com/global) does **not** list Tunisia, Morocco or Algeria. A Tunisia-registered platform cannot open a Stripe account directly; options are a legal entity in a supported country (e.g. France, or a US company via Stripe Atlas) or a local licensed PSP. Stripe Connect payouts additionally require each teacher's country to be supported. **Therefore payouts are gated off** and no escrow-like balance is held.
- **Nominatim** — usage policy (https://operations.osmfoundation.org/policies/nominatim/): max 1 request/second for the whole app, identifying User-Agent, attribution, caching, **no autocomplete**, and it must be a deliberate operator choice. ClassBridge therefore keeps it **off by default** and only enables it when the operator sets `NOMINATIM_CONTACT_EMAIL`; queries are user-triggered button searches.
- **LiveKit** — tokens are JWTs with a `video` grant (https://docs.livekit.io/home/server/generating-tokens/). We issue `roomJoin` for one room only, no `roomAdmin/roomCreate/roomRecord`, opaque identity (user UUID) and random room names (no PII), TTL ≤ 10 minutes (important for self-hosted where revocation is not available).
- **Mapbox** — Geocoding v6 distinguishes temporary vs permanent results (`permanent=true` requires an eligible account). The adapter only stores precise coordinates when `MAPBOX_PERMANENT_GEOCODING=true` AND the teacher opts in.

## Environment notes (this sandbox)
- ~7.9 GB RAM shared with other workloads; usable memory frequently dropped below 300 MB, which OOM-killed `tsc`/build processes several times. Builds were run with `NODE_OPTIONS=--max-old-space-size=1536`.
- Postgres data lives in `./.pgdata` with `fsync=off, synchronous_commit=off` **for dev/test only** (the workspace volume has slow fsync). Set `PG_DURABLE=1` to disable this.
- The sandbox's output display rewrites ISO timestamps for readability; this does not affect the program (`toISOString()` returns standard ISO 8601).
