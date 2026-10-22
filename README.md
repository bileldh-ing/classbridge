# ClassBridge

[![CI](https://github.com/bileldh-ing/classbridge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bileldh-ing/classbridge/actions/workflows/ci.yml)
[![CodeQL](https://github.com/bileldh-ing/classbridge/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/bileldh-ing/classbridge/actions/workflows/codeql.yml)
[![Dependency audit](https://github.com/bileldh-ing/classbridge/actions/workflows/dependency-audit.yml/badge.svg?branch=main)](https://github.com/bileldh-ing/classbridge/actions/workflows/dependency-audit.yml)
[![Mobile](https://github.com/bileldh-ing/classbridge/actions/workflows/mobile.yml/badge.svg?branch=main)](https://github.com/bileldh-ing/classbridge/actions/workflows/mobile.yml)
[![CD](https://github.com/bileldh-ing/classbridge/actions/workflows/cd.yml/badge.svg)](https://github.com/bileldh-ing/classbridge/actions/workflows/cd.yml)

ClassBridge is a learning marketplace: students find verified teachers (by subject, level, language, price, format and distance), book and pay for lessons, join a private live classroom, and follow self-paced courses with quizzes and certificates. Teachers build a public profile, set availability, publish offerings and courses, and track earnings. Staff verify teachers, moderate reports, handle refunds and read an append-only audit log. The UI is available in English, French and Arabic (full right-to-left layout).

> **Status:** production-hardened build (staff 2FA, nonce CSP, rate limits, monitoring adapter, health/readiness, CI/CD). Go-live still needs real provider credentials and a payment entity decision — see [`docs/HANDOVER.md`](docs/HANDOVER.md). Per-requirement status: [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md). No payment, video or geocoding provider credentials are configured in this repository; those features show an honest "not configured" state.

## Features (implemented and exercised by tests or smoke checks)
- Email/password auth (argon2id, DB sessions, email verification, password reset, logout / logout-all, rate limits), one identity with student + teacher capabilities.
- Teacher directory with server-side filters, Postgres full-text + trigram search, pagination, list/map views (Leaflet + clustering, OpenStreetMap tiles), approximate-location privacy and radius/bbox search.
- Teacher onboarding: profile, subjects, offerings, availability rules/exceptions, private credential uploads, submit for review; admin approval and explicit badges.
- Booking with slot holds, a server-side state machine, append-only booking events and a database exclusion constraint against double booking; `.ics` export; cancellation policies.
- Checkout through a `PaymentProvider` adapter (Stripe Checkout) with signed, idempotent webhooks, order snapshots, append-only teacher ledger and provider-driven refunds. Free lessons/courses work without a provider.
- Live classroom via LiveKit: short-lived, room-scoped tokens issued only to participants inside the join window.
- Courses: sections/lessons, protected paid content, progress, quizzes with attempt limits, server-side completion and verifiable certificates.
- Messaging with membership checks and blocking, in-app notifications, email outbox with idempotency keys.
- Admin: dashboard metrics, users (suspend/reactivate), teacher verification, bookings, payment events, refunds, reports, audit log, **support queue with internal notes, subjects/categories, feature flags, course/profile moderation** — behind **TOTP two-factor** and a real HTTP 403 for non-staff.
- **Rescheduling** (atomic, policy-checked) and **group lessons** with capacity (flag `group_lessons`).
- **Support tickets** for every user, optionally linked to a booking.
- **Family access**: guardian links with learner consent and read-only, limited permissions (flag `guardian_links`; minors stay gated by `minor_accounts`, off).
- **LMS**: assignments with written answers, manual grading with append-only history, private notes, bookmarks, course announcements.
- **Messaging**: attachments (private storage, magic-byte + size checks) and realtime updates (SSE over Postgres LISTEN/NOTIFY).
- **Production hardening**: nonce-based CSP + security headers, Postgres rate limits, PII-scrubbed structured logs and Sentry-compatible error reporting (optional), `/api/health/live` + `/api/health/ready`.
- **PWA** (manifest, icons, service worker, offline page) and **Capacitor** Android/iOS wrappers for store distribution.

## Quick start (development)
```bash
pnpm install
cp .env.example .env.local        # then set AUTH_SECRET (openssl rand -hex 32)
pnpm db:start                     # embedded PostgreSQL 17 on 127.0.0.1:54329 (data in ./.pgdata)
pnpm db:migrate && pnpm db:seed   # schema + clearly labelled demo data
pnpm dev                          # http://localhost:3000
```
Full instructions: [`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md). Tests: [`docs/TESTING.md`](docs/TESTING.md). Deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Demo accounts (development seed only)
All seeded people are fictional and marked "(Demo)". Password for every demo account: `DemoPass123!`

| Account | Role |
|---|---|
| `admin@classbridge.test` | admin |
| `support@classbridge.test` | support (least privilege) |
| `student@classbridge.test`, `student2@classbridge.test` | students |
| `amira.demo@classbridge.test`, `lucas.demo@…`, `sara.demo@…`, `youssef.demo@…`, `emma.demo@…`, `karim.demo@…`, `nadia.demo@…` | published teachers |
| `pierre.demo@classbridge.test` | teacher pending review |

Staff accounts (admin, support) have TOTP enabled in the demo seed. Add the demo secret printed by `pnpm db:seed` to an authenticator app (it is derived from the fixed string `classbridge-demo-otp`; e2e tests compute it the same way). In development `ADMIN_MFA_REQUIRED` defaults to false; production builds require it.

Seed reviews are labelled demo data. Never run `pnpm db:seed` against a production database.

## Payments note
Stripe does **not** list Tunisia as a supported country (https://stripe.com/global). A Tunisia-registered platform needs either an entity in a Stripe-supported country or a local licensed PSP adapter. Teacher **payouts are gated off**: there is no withdraw button and no money is held in a database balance. See [`docs/PAYMENTS_AND_REFUNDS.md`](docs/PAYMENTS_AND_REFUNDS.md).

## Docker
```bash
AUTH_SECRET=$(openssl rand -hex 32) docker compose up --build   # app + PostgreSQL 17, migrations run first
```
Tagged releases (`v*`) publish `ghcr.io/bileldh-ing/classbridge` and a GitHub Release (see `.github/workflows/cd.yml`).

## Tests
`pnpm test:unit`, `pnpm test:integration` (needs Postgres: embedded via `pnpm db:start`, or set `TEST_DATABASE_URL`), `pnpm test:e2e` (Playwright, seeded app), `pnpm test:demo` (narrated demo tour; one video per scene). CI runs all of them on every push/PR.

## Documentation
| Doc | Content |
|---|---|
| `docs/LOCAL_SETUP.md` | prerequisites, env vars, database, providers |
| `docs/TESTING.md` | commands, layers, last verified results |
| `docs/DEPLOYMENT.md` | production checklist, webhooks, backups |
| `docs/IMPLEMENTATION_STATUS.md` | every spec section with status and evidence |
| `docs/HANDOVER.md` | what works, what doesn't, next steps |
| `docs/API.md` | endpoint catalogue and error envelope |
| `docs/SECURITY_PRIVACY.md` | threat model, authorization matrix, gaps |
| `docs/PAYMENTS_AND_REFUNDS.md` | provider eligibility, flows, go-live |
| `docs/MAPS_LOCATION_PRIVACY.md` | geocoding and location privacy |
| `docs/CLASSROOM.md` | LiveKit token lifecycle |
| `docs/TECH_DECISIONS.md` | versions and rationale |
| `docs/PRODUCT_REQUIREMENTS.md` | roles, journeys, non-functional requirements |
| `docs/ARCHITECTURE.md` | system, request, concurrency and deployment diagrams (mermaid) |
| `docs/DATABASE.md` | ERD (mermaid), migrations, constraints |
| `docs/USER_GUIDE_STUDENT.md`, `docs/USER_GUIDE_TEACHER.md`, `docs/USER_GUIDE_ADMIN.md` | short user guides |

Demo videos (one per scene) are produced by the `Demo video` workflow as the `demo-scenes` artifact.
