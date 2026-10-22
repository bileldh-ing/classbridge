# Product requirements — ClassBridge

Source: `ClassBridge_Educational_Platform_Master_Build_Spec` (§1–§12). This document restates the requirements the build is held to; per-requirement status lives in [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

## 1. Vision
A two-sided education marketplace where learners find trustworthy teachers (online or nearby), book real availability, pay through a configured provider, learn live in a private classroom or through self-paced courses, and track progress — in English, French and Arabic (full RTL), on web, as an installable PWA, and in Android/iOS store wrappers.

## 2. Users and roles
| Role | Can | Cannot |
|---|---|---|
| Visitor | browse published teachers, subjects, course catalogue, info pages | see private learner data, join sessions |
| Student | search/save teachers, book & pay, join eligible lessons, enroll in courses, submit assignments/quizzes, message teachers they booked, review completed lessons, open support tickets, consent to guardian links | see other learners' data, review without an attended lesson |
| Teacher (same identity) | profile, credentials, offerings (trial / 1:1 / group), availability, accept & deliver lessons, reschedule (≥2 h notice), courses, assignments + grading, announcements, earnings view | publish before admin approval, see private learner data beyond their bookings |
| Parent / guardian | request read-only access to a learner's schedule/progress; active only after the learner's explicit consent; revocable by both | impersonate the learner, see messages/payments/notes |
| Support moderator | support queue (reply, internal notes, status), reports, content moderation | verify teachers, refunds, feature flags |
| Administrator | everything above + verification, users, refunds, subjects/categories, feature flags, audit log | act without a reason (every privileged action is audited) |

Staff actions require a TOTP-verified session (production default). One account can hold student and teacher capabilities; switching context never creates a second identity.

## 3. Core journeys (acceptance criteria)
- **A. Find & book:** search with server-side filters (subject, level, language, price, format, rating, verified, distance); list + map with approximate locations; profile; time-zone-correct slot picker; slot hold with countdown; free confirmation or provider checkout; confirmation notification/email + `.ics`; reschedule within policy (student ≥ 24 h, teacher ≥ 2 h, max 2, atomic); cancellation with policy-driven refunds; review after an attended lesson.
- **B. Teacher onboarding:** become a teacher → profile, subjects, offerings, availability, credentials (private upload) → submit → admin approval with reason → published with explicit badges.
- **C. Live lesson:** tokens only for participants, only inside the join window, short TTL; attendance; notes; group sessions share one room.
- **D. Self-paced learning:** catalogue, enroll (free or verified payment), protected content, progress, quizzes (attempt limits, hidden answers), assignments with written answers and manual grading (history kept), notes, bookmarks, announcements, verifiable certificates.
- **E. Support/admin:** users open tickets (optionally linked to a booking); staff triage a queue with internal notes; reports & moderation; feature flags; every privileged action in an append-only audit log.

## 4. Non-functional requirements
- **Security:** argon2id, DB sessions (hashed tokens), same-origin checks on mutations, Postgres-backed rate limits, nonce-based CSP, strict security headers, private storage with magic-byte validation, staff 2FA, PII-scrubbed logs and error reports.
- **Privacy:** precise teacher locations never public; approximate coordinates rounded; guardian access is consent-based and revocable; minors gated behind the `minor_accounts` flag (off).
- **Reliability:** DB-level double-booking prevention (exclusion constraints + advisory locks), idempotent webhooks/emails, `/api/health/live` and `/api/health/ready`.
- **Accessibility & i18n:** WCAG 2.2 AA intent (labels, focus, semantics), EN/FR/AR with RTL.
- **Delivery:** CI (lint, typecheck, unit, integration on Postgres 17, build, e2e), CodeQL, dependency audit, Docker image on GHCR for tags, mobile builds.

## 5. Out of scope / gated
Optional AI (flag off), institution accounts, payouts (gated until a licensed payout model exists), automated malware scanning (adapter point documented), accounts for minors (flag off).
