# Testing

## Commands
```bash
pnpm db:start            # integration tests need the embedded Postgres on :54329
pnpm typecheck           # tsc --noEmit
pnpm lint                # eslint . (on low-memory machines lint folders separately, see below)
pnpm test                # all Vitest tests (unit + integration)
pnpm test:unit
pnpm test:integration
pnpm build               # next build (includes Next's own type check)
```
Integration tests use the database `classbridge_test` (override with `TEST_DATABASE_URL`). `tests/global-setup.ts` drops and recreates the schema from the committed migrations before each run, so tests always run against real PostgreSQL with the real constraints. Provider credentials are blanked in `vitest.config.ts`; Stripe webhooks are tested with events signed locally by the official SDK (`tests/fake-stripe.ts`), never against Stripe's servers.

## Layers
| Layer | Files | What it covers |
|---|---|---|
| Unit (49 tests) | `tests/unit/*.test.ts` | money (integer minor units, fees), cancellation policies, booking state machine, slot generation incl. DST, role permissions, quiz grading & certificate eligibility, upload sniffing & `.ics`, search-param validation, location privacy, 0.5 km distance rounding, Stripe webhook verification |
| Integration (38 tests, real Postgres) | `tests/integration/*.test.ts` | auth lifecycle, admin verification + audit, search filters/privacy, messaging access control, concurrent double-booking, holds/expiry, booking authorization, classroom token authorization & join window, review eligibility, course content protection/certificates/paid enrollment, checkout, webhook idempotency, refunds, append-only ledger |
| Smoke (manual curl against `next start`) | see below | public routes, auth redirects, 401/403 on APIs |
| End-to-end (Playwright) | — | **blocked**, see below |

## Last verified results (21 Oct 2026, this sandbox: linux arm64, 2 CPU, memory-constrained)
| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no errors (run twice: before and after `.next/types` existed) |
| `eslint` (run per folder: `src/lib`, `src/components`, `src/app/(site)`, `src/app/(app)`, `src/app/api`, `src/app/dev`, root app files, `scripts`, `tests`, config files) | all exit 0, no findings. A single `eslint .` run was OOM-killed (exit 137) by the machine, not by a lint error |
| `next build` (Next 16.4.2, Turbopack) | **succeeded**. First attempt failed at "Running TypeScript" because the kernel OOM-killed the type-check worker (confirmed in `dmesg`); the retry passed: compiled, type-checked, 74 static/dynamic routes generated. Rebuilt successfully again after removing `src/app/(site)/loading.tsx` |
| `npx vitest run` | **13 files, 87 tests passed, 0 failed** (49 unit, 38 integration), 83 s |
| `npx playwright install chromium` | **failed**: `cdn.playwright.dev` returned HTTP 403 for `chrome-linux-arm64.zip` (Chrome for Testing 156, linux-arm64). No e2e tests were added or run |

### Smoke test (`next start -p 3100` + embedded Postgres with seed data)
Anonymous:

| Request | Status |
|---|---|
| `GET /api/health` | 200 |
| `GET /`, `/teachers`, `/teachers?subject=mathematics`, `/teachers?q=python`, `/teachers?view=map` | 200 |
| `GET /teachers/amira-demo-1` (published) | 200 |
| `GET /teachers/pierre-demo-8` (pending review, unpublished) | 404 |
| `GET /teachers/does-not-exist` | 404 |
| `GET /signin`, `/signup`, `/forgot-password`, `/courses`, `/courses/python-basics-demo`, `/subjects`, `/how-it-works`, `/become-a-teacher`, `/pricing`, `/help`, `/legal/terms`, `/legal/privacy`, `/legal/cancellation`, `/sitemap.xml`, `/robots.txt` | 200 |
| `GET /api/search/teachers?subject=mathematics` | 200 (1 result, approximate position, `isDemo: true`) |
| `GET /admin`, `/dashboard`, `/teach`, `/lessons` | 307 → `/signin` |
| `POST /api/classrooms/<id>/token`, `POST /api/checkout`, `POST /api/bookings`, `GET /api/bookings`, `GET /api/notifications`, `GET /api/admin/credentials/<id>/file` | 401 `UNAUTHENTICATED` |

Signed in as `student@classbridge.test`:

| Request | Status |
|---|---|
| `POST /api/auth/login` | 200 |
| `GET /admin` | 200 rendering the permission-denied page ("This area is restricted to platform staff."), no admin data |
| `POST /api/admin/users/<id>/status` | 403 `FORBIDDEN` |
| `POST /api/classrooms/<unknown booking>/token` | 404 `NOT_FOUND` |
| `POST /api/auth/logout` with `Origin: https://evil.example` | 403 cross-site request rejected |

Fix made during smoke testing: unknown/unpublished teacher pages returned HTTP 200 (with not-found content) because `src/app/(site)/loading.tsx` started streaming before `notFound()`. The file was removed; they now return 404.

## Known gaps
- **E2E not run** (Playwright browser download blocked for linux-arm64 in this environment). Spec §11 E2E scenarios 1–10 are therefore unverified in a browser. To add: `pnpm add -D @playwright/test`, `npx playwright install chromium`, a `playwright.config.ts` with `webServer: { command: "pnpm start" }`, and a first spec: visit `/teachers?q=mathematics`, click the first card, expect the profile heading.
- No live-provider tests (Stripe, LiveKit, Mapbox, Resend have no credentials here).
- No accessibility audit (axe) or load/performance measurements were run.
- No CI workflow is committed (`.github/workflows` absent).
- Admin permission-denied pages return HTTP 200 with a denial message (API endpoints return proper 401/403).
