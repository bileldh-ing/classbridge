# Handover — 21 Oct 2026

## State
ClassBridge is a working **development build** of the learning marketplace: Next.js 16.4.2 + React 19 + Drizzle on PostgreSQL 17, custom argon2id/DB-session auth, Stripe/LiveKit/Mapbox/Resend adapters (none configured). It builds, type-checks, lints clean and passes all automated tests. It is **not production-ready** (see blockers).

## Verified this session (commands actually run)
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint (per folder, whole repo) | 0 findings |
| `next build` | success (one earlier attempt OOM-killed by the machine, retry passed) |
| Smoke test on `next start` | public pages 200; unpublished/unknown teacher 404; private pages 307 → `/signin`; protected APIs 401 anonymous; student → admin API 403; student `/admin` shows permission-denied; cross-origin POST 403. Full table in `TESTING.md` |
| Vitest | 13 files, **87/87 passed** (49 unit, 38 integration on real Postgres) |
| Playwright | **blocked** — Chromium download 403 for linux-arm64; no e2e tests exist |

## Changes made in this session
- Public search distances are now rounded to the nearest 0.5 km (`roundPublicDistanceKm` in `src/lib/geo/approx.ts`, used by `src/lib/services/teacher-search.ts`, unit test added). `docs/MAPS_LOCATION_PRIVACY.md` previously claimed this while the code rounded to 1 km; doc and code now agree.
- Removed `src/app/(site)/loading.tsx` so `notFound()` on public pages returns HTTP 404 instead of 200 (streaming started before the not-found decision).
- Committed pending UI fixes left uncommitted by the previous engineer (booking widget, lessons page, availability page, sign-out button, postcss config).
- Wrote README, LOCAL_SETUP, TESTING, DEPLOYMENT, IMPLEMENTATION_STATUS, user guides and this handover.

## How to run
See `LOCAL_SETUP.md`. Short version: `pnpm install && cp .env.example .env.local && pnpm db:start && pnpm db:migrate && pnpm db:seed && pnpm dev`. Demo logins in `README.md` (password `DemoPass123!`, dev only).

## Blockers (need decisions or credentials)
1. **Payments**: Stripe does not support Tunisia (https://stripe.com/global). Decide on a legal entity in a Stripe-supported country or a licensed local PSP (adapter to write behind `PaymentProvider`). Teacher **payouts are gated off** until a licensed payout model exists; no funds are held in the database. TND/MAD offerings are not Stripe settlement currencies.
2. **LiveKit credentials** to test the classroom with real media.
3. **Geocoding**: Mapbox token (and plan allowing permanent storage, if precise coordinates are to be stored).
4. **Email**: Resend key + verified domain.
5. **Browser for e2e**: run Playwright on an x86_64 machine or CI runner.

## Not implemented / partial (short list)
- Parent/guardian and minor safeguarding (keep the platform adult-only).
- Lesson rescheduling; group lessons (flag off); packages.
- LMS: assignments/submissions, written answers + manual grading, notes/bookmarks, announcements, timed quizzes.
- Messaging attachments and realtime push; notification preferences.
- Support ticket creation for users; admin subject management, course moderation, feature-flag/config UI.
- Admin MFA; nonce-based CSP; upload malware scanning; cloud object storage with signed URLs; error monitoring.
- CI workflow, Dockerfile, accessibility audit, performance measurement.
- Docs not written: PRODUCT_REQUIREMENTS.md, ARCHITECTURE.md, DATABASE.md.
- Permission-denied app pages render a denial message with HTTP 200 (APIs use proper 401/403).

Full per-section matrix: `IMPLEMENTATION_STATUS.md`.

## Suggested next steps
1. Settle the payment provider/legal entity question; implement the chosen PSP adapter and test end-to-end in sandbox mode.
2. Add CI (typecheck, lint, vitest with a Postgres service, Playwright on x86_64) and the first e2e spec (visitor search → teacher profile).
3. Admin MFA + nonce CSP + object storage before any public launch.
4. Rescheduling and guardian flows if the target market includes minors.
