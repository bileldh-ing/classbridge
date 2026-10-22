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
pnpm test:e2e            # Playwright against a seeded, running app (E2E_BASE_URL, default http://localhost:3000)
pnpm test:demo           # @demo tour: one 1920x1080 video per scene → demo-scenes/
```
Integration tests use the database `classbridge_test` (override with `TEST_DATABASE_URL`). `tests/global-setup.ts` drops and recreates the schema from the committed migrations before each run, so tests always run against real PostgreSQL with the real constraints. Provider credentials are blanked in `vitest.config.ts`; Stripe webhooks are tested with events signed locally by the official SDK (`tests/fake-stripe.ts`), never against Stripe's servers.

Integration tests read `TEST_DATABASE_URL` (CI uses a `postgres:17` service container; locally the embedded server from `pnpm db:start`).

## Layers
| Layer | Files | What it covers |
|---|---|---|
| Unit (57 tests, 9 files) | `tests/unit/*.test.ts` | previous suite + TOTP (RFC 6238 vectors, replay, encryption at rest), reschedule policy, monitoring/log PII scrubbing, upload sniffing (WebP/GIF/allow-lists) & filename sanitising, nonce CSP builder |
| Integration (57 tests, 6 files, real PostgreSQL 17) | `tests/integration/*.test.ts` | previous suite + `production-features.test.ts`: atomic/concurrent rescheduling, group capacity under concurrency, duplicate seats, support internal notes, flags/taxonomy/moderation authz + audit, guardian consent & limited view, assignments + append-only grading history, notes/bookmarks privacy, announcements, attachments (type/size/membership), LISTEN/NOTIFY realtime, staff TOTP sessions |
| End-to-end (13 tests, Playwright chromium, CI) | `e2e/*.spec.ts` | visitor search → profile (+404), map view, CSP/headers/readiness, signup/signout/signin, wrong password, paid booking → checkout "payment not configured", free booking confirmed, classroom token denied to non-participant (API 404 + page 404), non-staff admin → HTTP 403, admin TOTP + teacher approval + audit entry, support internal notes hidden from requester, Arabic RTL, mobile viewport + PWA manifest |
| Demo tour (17 scenes, `@demo`, excluded from CI) | `e2e/demo-tour.spec.ts`, `playwright.demo.config.ts` | full product walkthrough recorded by `demo-video.yml` (artifact `demo-scenes`) |

## Last verified results (22 Oct 2026, GitHub Actions ubuntu-latest, commit 17b9e59)
| Check | Result |
|---|---|
| ESLint (`pnpm lint`) | pass |
| `tsc --noEmit` | pass |
| Unit | 57/57 passed |
| Integration (postgres:17 service) | 57/57 passed |
| `next build` (standalone) | pass |
| Playwright e2e (chromium) | 13/13 passed; HTML report + videos uploaded as artifacts `playwright-report`, `playwright-videos` |
| Docker image build | pass |
| CodeQL | pass |

Local sandbox note: this development machine (linux arm64, ~1 GB free RAM shared with other workloads) cannot run `tsc`/`next build` reliably and cannot download Chromium for arm64; CI is the source of truth for these checks.

## Known gaps
- No automated accessibility (axe) or performance budget checks yet.
- Live providers (Stripe, LiveKit, Mapbox, Resend) are not exercised end-to-end (no credentials); adapters are tested with signed fake events / not-configured states.
