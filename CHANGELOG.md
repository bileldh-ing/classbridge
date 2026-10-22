# Changelog

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
