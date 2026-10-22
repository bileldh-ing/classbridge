# Handover — 22 Oct 2026

## State
ClassBridge is a **production-hardened** learning marketplace: Next.js 16.4.2 + React 19 + Drizzle on PostgreSQL 17, custom argon2id/DB-session auth with **staff TOTP 2FA**, nonce-based CSP, Stripe/LiveKit/Mapbox/Resend adapters (not configured here), PWA + Capacitor Android/iOS shells, and full CI/CD on GitHub Actions. Every check runs green in CI (see `TESTING.md`). Go-live is blocked only by business decisions and credentials (below).

## What was added in this session
- **Bookings:** rescheduling (atomic move under a per-teacher advisory lock + exclusion constraints; student ≥24 h, teacher ≥2 h, max 2) and **group lessons** with capacity (flag `group_lessons`).
- **Support:** user tickets (optionally linked to a booking), staff queue with internal notes, status/assignment, audit.
- **Admin:** subjects/categories, feature flags, course & profile moderation; non-staff get HTTP 403 on admin pages.
- **Guardians:** consent-based, read-only, revocable family access (flag `guardian_links`); minors remain gated (`minor_accounts` off, signup 18+).
- **LMS:** assignments with written answers, manual grading with append-only history, private notes, bookmarks, announcements.
- **Messaging:** attachments (private storage, magic bytes, 5 MB) + realtime via SSE over Postgres LISTEN/NOTIFY.
- **Hardening:** staff TOTP, nonce CSP + security headers, more rate limits, PII-scrubbed structured logs, optional Sentry-compatible reporting (`SENTRY_DSN`), `/api/health/live` + `/api/health/ready`.
- **Delivery:** PWA (manifest, icons, service worker, offline page); Capacitor `android/` + `ios/` loading `CAP_SERVER_URL`; fastlane lanes.
- **CI/CD:** `ci.yml`, `codeql.yml`, `dependency-audit.yml`, `cd.yml` (GHCR + Release + gated deploy), `mobile.yml`, `demo-video.yml`, `release-please.yml` (gated), Dependabot, PR template, CODEOWNERS; multi-stage `Dockerfile` + `docker-compose.yml`.
- **Docs:** PRODUCT_REQUIREMENTS, ARCHITECTURE (mermaid), DATABASE (ERD), and updates to API, SECURITY_PRIVACY, DEPLOYMENT, TESTING, IMPLEMENTATION_STATUS, README (CI badges).
- Migration `drizzle/0003_production.sql` (additive).

## How to run
`pnpm install && cp .env.example .env.local && pnpm db:start && pnpm db:migrate && pnpm db:seed && pnpm dev`, or `AUTH_SECRET=$(openssl rand -hex 32) docker compose up --build`. Demo logins in `README.md`; staff accounts have a demo TOTP secret printed by the seed.

## Blockers (need decisions or credentials)
1. **Payments:** Stripe does not support Tunisia (https://stripe.com/global) → legal entity in a supported country or a licensed local PSP adapter. Payouts stay gated off.
2. **LiveKit**, **Mapbox**, **Resend** credentials for live tests.
3. **Release automation:** enable *Allow GitHub Actions to create and approve pull requests* and set variable `RELEASE_PLEASE_ENABLED=true` (the integration token cannot change this setting).
4. **Mobile stores:** set variable `CAP_SERVER_URL` to the production URL and add signing secrets (listed in `DEPLOYMENT.md#mobile`).
5. **Deploy target:** add one of `FLY_API_TOKEN` / `RENDER_DEPLOY_HOOK_URL` / `VERCEL_TOKEN` (container host recommended for SSE).

## Remaining gaps (not built)
Malware scanning hook implementation, S3/R2 storage adapter with signed URLs, OAuth sign-in, notification preferences, teacher analytics & student roster pages, timed quizzes, automated data export/erasure, axe/performance checks, invoices, institution accounts. Details: `IMPLEMENTATION_STATUS.md`.
