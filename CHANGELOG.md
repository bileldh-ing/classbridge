# Changelog

## 1.0.0 (2026-10-22)


### Bug Fixes

* **ci:** mobile e2e device without browser override; allow embedded-postgres darwin builds ([5b8b84b](https://github.com/bileldh-ing/classbridge/commit/5b8b84b0980d570d577dbb7033292dc2aa66c171))
* **group-lessons:** explicit duplicate-seat check before the student overlap constraint ([6533e21](https://github.com/bileldh-ing/classbridge/commit/6533e217d7ddfaa3598a72c2443c5159d78ff5b2))

## Changelog

All notable changes are documented here. Entries are generated from conventional commits by release-please.

## Unreleased
- feat: lesson rescheduling (atomic slot move, notice/limit policy), group lessons with capacity
- feat: support tickets with internal notes; admin support queue, subjects, feature flags, moderation
- feat: guardian links with learner consent (feature-flagged); minors stay gated
- feat: LMS assignments with manual grading history, notes, bookmarks, announcements
- feat: message attachments (private storage, magic-byte checks) and realtime updates (SSE + LISTEN/NOTIFY)
- feat(security): staff TOTP 2FA, nonce-based CSP, real 403 for admin pages, PII-scrubbed monitoring adapter, health/readiness endpoints
- feat: installable PWA + Capacitor Android/iOS wrappers
- ci: CI (lint, typecheck, unit, integration on Postgres 17, build, Playwright e2e), CodeQL, dependency audit, Docker/GHCR CD, mobile builds, demo video
