# Implementation status

Updated 22 Oct 2026. Status values: **implemented**, **partial** (partially implemented), **blocked** (needs something outside the repo), **not implemented**.
"Evidence" names routes, files, migrations and test names. Test results are those of the latest CI run (see `TESTING.md`). Migrations: `drizzle/0000_extensions.sql`, `0001_init.sql`, `0002_constraints.sql`, `0003_production.sql`. Provider-backed features were never exercised against the real provider (no credentials).

## §0 Execution rules / definition of done
| Requirement | Status | Evidence / notes |
|---|---|---|
| Real Postgres, versioned migrations, seed labelled demo | implemented | `drizzle/*.sql`, `scripts/migrate.ts`, `scripts/seed.ts` (all names "(Demo)", `users.is_demo`, demo reviews flagged) |
| Server-side adapters, no silent success when unconfigured | implemented | `src/lib/payments/*`, `src/lib/classroom/provider.ts`, `src/lib/geo/geocoding.ts`, `src/lib/email/*`; test "unconfigured provider: honest error, nothing charged, booking still held"; `/api/health` providers block |
| Lint / typecheck / unit / integration / build recorded honestly | implemented | `TESTING.md` |
| E2E tests | implemented (CI) | `e2e/*.spec.ts` run in GitHub Actions (ubuntu x86_64, chromium) against a seeded standalone build; report + videos uploaded as artifacts |
| `TECH_DECISIONS.md` | implemented | `docs/TECH_DECISIONS.md` |

## §1 Roles
| Role | Status | Evidence |
|---|---|---|
| Visitor | implemented | public routes smoke-tested 200; drafts 404 |
| Student | implemented | `/dashboard`, `/lessons`, `/my-courses`, `/saved`, `/payments`, `/messages` |
| Teacher (same identity) | implemented | `user_roles`, `/api/auth/role`; test "role upgrade keeps a single identity" |
| Parent/guardian | implemented (flag `guardian_links`) | `guardian_links`, `src/lib/services/guardians.ts`, `/guardian`, `/guardian/consent`; learner consent recorded in `consent_records`; read-only limited view; revocable. Minors stay gated (`minor_accounts` off, signup 18+). Test "nothing is shared before learner consent…" |
| Institution/team | not implemented | — |
| Support moderator | implemented | support queue `/admin/support` (reply, internal notes, status, assign), moderation `/admin/moderation`; least privilege (no verification/refunds/flags); TOTP required |
| Administrator | implemented | + `/admin/subjects`, `/admin/flags`, `/admin/moderation`, `/admin/support`; all audited; TOTP 2FA; non-staff get HTTP 403 (`forbidden()`) |

## §2 Architecture
| Item | Status | Evidence |
|---|---|---|
| Next.js App Router + TS, RSC | implemented | Next 16.4.2, `src/app` |
| Tailwind + accessible component kit + Lucide | implemented | `src/components/ui` |
| RHF + Zod | implemented | `src/lib/validation`, `src/components/forms` |
| PostgreSQL + Drizzle + SQL migrations | implemented | `src/lib/db/schema.ts`, `/drizzle` |
| Supabase | not implemented (by decision) | plain Postgres + custom auth; documented in TECH_DECISIONS |
| OpenAPI / typed API docs | partial | `docs/API.md` (hand-written), no OpenAPI file |
| Background jobs | partial | `scripts/jobs.ts` (hold expiry, email delivery, 24h/1h reminders) run by cron/loop; no Redis queue; no transcoding |
| Realtime | implemented | Postgres `LISTEN/NOTIFY` (`messages_notify` trigger) → `src/lib/realtime.ts` → SSE `/api/conversations/[id]/stream` (membership-checked); test "new messages are published on the cb_messages channel" |
| LiveKit classroom | implemented (adapter) / blocked (live test) | `src/lib/classroom/provider.ts`; tests in `classroom-reviews.test.ts`; no LiveKit credentials |
| GeocodingProvider / MapProvider | partial | `GeocodingProvider` with Mapbox + Nominatim; map is Leaflet with configurable tiles (no separate `MapProvider` interface) |
| Payment/Refund/Payout provider interfaces | implemented (Stripe adapter) / blocked (live) | `src/lib/payments/provider.ts`, `stripe.ts`; payouts gated. Stripe does not support Tunisia (https://stripe.com/global) |
| CI/CD (GitHub Actions) | implemented | `ci.yml` (lint, typecheck, unit, integration on postgres:17, build, Playwright e2e, docker build), `codeql.yml`, `dependency-audit.yml`, `cd.yml` (GHCR + Release + gated deploy), `mobile.yml`, `demo-video.yml`, `release-please.yml`, Dependabot |
| Error monitoring | implemented (adapter) | `src/lib/monitoring.ts` (Sentry envelope API, PII-scrubbed, optional via `SENTRY_DSN`), `src/instrumentation.ts` `onRequestError`; unit test "builds events without query strings, emails or secrets" |
| Docker | implemented | multi-stage `Dockerfile` (standalone, non-root, healthcheck, bundled `migrate.mjs`), `docker-compose.yml` (app + postgres + migrate) |
| Health check, rate limiting, audit | implemented | `/api/health`, `/api/health/live`, `/api/health/ready` (DB + pending migrations), `rate_limits` on login/booking/messages/tickets/MFA/announcements/guardian requests, `audit_log` (append-only trigger) |
| Optional AI off by default | implemented (as off) | `feature_flags.ai_features=false`; no AI features built |

## §3 Brand, UX, design system
| Item | Status | Evidence |
|---|---|---|
| Visual direction, responsive layouts | implemented | Tailwind kit; not visually audited in a browser in this session |
| WCAG 2.2 AA | partial | labels, focus rings, skip-to-main, semantic headings in code; **no axe/keyboard audit run** |
| EN/FR/AR with RTL | implemented | `src/lib/i18n/messages.ts` (type-checked completeness), `<html lang dir>` in `src/app/layout.tsx`, logical CSS props; RTL not visually tested |
| Role-specific navigation, permission-filtered links | implemented | `src/components/layout/app-shell.tsx` (admin links filtered by `perm`) |
| Nav items | partial | added: Support (users), Family access, Group sessions, Support queue, Moderation, Subjects, Feature flags; assignments reachable from course pages. Not built: teacher analytics, student roster page |

## §4 Journeys
| Journey | Status | Notes |
|---|---|---|
| A — find & book | implemented / blocked (live payments) | + rescheduling (`src/lib/services/reschedule.ts`, atomic, policy) and group seats; e2e "paid lesson reaches checkout…", "free trial lesson can be confirmed end to end"; paid checkout untested against real Stripe |
| B — teacher onboarding | implemented | `/become-a-teacher`, `/teach/profile`, `/teach/offerings`, `/teach/availability`, `/teach/credentials`, `/api/teachers/me/submit`, admin decision + badges; test "non-admins are refused; approval publishes and writes an immutable audit record". No malware scan |
| C — live lesson | partial | token authorization tested; room UI (`src/components/lessons/classroom.tsx`) never connected to a real LiveKit server |
| D — self-paced e-learning | implemented (timed attempts not built) | + assignments/written answers with manual grading & append-only history, notes, bookmarks, announcements (`src/lib/services/lms-extra.ts`, `/my-courses/[courseId]/assignments`) |
| E — support/admin | implemented | tickets (`/support`), queue with internal notes (`/admin/support`), moderation, flags, taxonomy; tests "internal notes are never visible to the requester…" (integration + e2e) |

## §5 Functional specification
| Section | Status | Evidence / gaps |
|---|---|---|
| 5.1 Public site & SEO | partial | all listed pages return 200 (smoke); `sitemap.ts`, `robots.ts`, metadata + Open Graph on teacher pages; unpublished/unknown teacher → 404. Gaps: no JSON-LD, no city/subject landing pages (subject pages only), legal texts are placeholders |
| 5.2 Auth & account lifecycle | partial | + staff TOTP 2FA (RFC 6238, encrypted secret, replay protection, per-session verification; `/mfa`). Gaps: no OAuth, export/erasure are recorded requests only |
| 5.3 Directory & search | implemented | `/api/search/teachers`, `src/lib/services/teacher-search.ts` (FTS + trgm, filters, sort, pagination, radius, bbox); test "filters server-side, paginates, excludes drafts, and never returns private positions". Distances rounded to 0.5 km (`roundPublicDistanceKm`, test "rounds to the nearest 0.5 km"). PostGIS replaced by earthdistance (documented) |
| 5.4 Profile & offerings | partial | published-only profile, completeness indicator, intro video, offerings CRUD with status/archive. Gaps: group capacity (group lessons flagged off), intake questions, portfolio samples |
| 5.5 Scheduling & bookings | implemented | + rescheduling (tests "moves a confirmed lesson atomically…", "concurrent reschedules into the same slot: exactly one wins"), group sessions with capacity (test "enforces capacity under concurrency…") |
| 5.6 Live classroom | partial | random room names, token endpoint checks, short TTL, attendance, events; gaps: device check page, whiteboard, network-quality indicator, cleanup job; no live test |
| 5.7 Courses & LMS | implemented (minor gaps) | + assignments, written answers, manual grading history, notes, bookmarks, announcements. Gaps: learner roster page, signed URLs for course files, transcripts, timed quizzes |
| 5.8 Messaging & notifications | implemented (no notification preferences) | + attachments (`message_attachments`, private storage, magic bytes, 5 MB; test "accepts real images/PDFs only…"), realtime SSE |
| 5.9 Reviews | partial | eligibility + one per booking (tests "requires a completed, attended booking…", "a no-show booking cannot be reviewed"), teacher response column, moderation status, distinct badges. Gap: review report flow UI |
| 5.10 Payments, refunds, earnings | partial / blocked | orders/items snapshots, webhook verify + idempotency, append-only ledger, provider-driven refunds, disputes recorded (`payments.test.ts`, `stripe-webhook.test.ts`). Blocked: live Stripe untested; Stripe unavailable for a Tunisian entity; **payouts gated off** (no withdraw, `payout_status='unavailable'`). Gaps: packages, invoices |
| 5.11 Optional AI | not implemented | flag off by default (allowed by spec) |
| 5.12 Admin & operations | implemented (minor gaps) | + subjects/categories, course & profile moderation, feature flags, support queue. Gaps: email delivery log view, appeals, exports |

## §6 Data model
| Area | Status | Notes |
|---|---|---|
| Identity & access | partial | `users`, `profiles`, `user_roles`, `sessions`, `auth_tokens`, `consent_records`, `privacy_requests`, `user_reports`; no `guardian_relationships`, `user_blocks` handled per conversation |
| Teacher domain | implemented | `teacher_profiles`, `subject_categories`, `subjects`, `teacher_subjects`, `teacher_credentials`, `teacher_badges`, `teacher_locations` (private precise vs approx), `lesson_offerings`, `availability_rules`, `availability_exceptions`; holds live on `bookings` (`slot_held` + expiry) |
| Bookings | partial | `bookings`, `booking_events`, `attendance_records`, `lesson_notes`, `classroom_events`; no reschedule tables |
| Courses & assessment | partial | `courses`, `course_sections`, `course_lessons`, `course_enrollments`, `lesson_progress`, `quizzes`, `quiz_questions`, `question_options`, `quiz_attempts`, `certificates`; missing prerequisites, bookmarks/notes, assignments/submissions/grades |
| Social/comms | partial | `conversations`, `conversation_members`, `messages`, `notifications`, `email_outbox`, `reviews`, `saved_teachers`; missing attachments/receipts tables, notification prefs, saved courses, search events |
| Payments | partial | `orders`, `order_items`, `payment_intents`, `payment_events`, `provider_webhook_events`, `refunds`, `teacher_ledger_entries`; no payout tables (payouts gated), fee rules via env |
| Platform control | partial | `audit_log`, `feature_flags`, `support_tickets`, `rate_limits`; no settings/taxonomy history |
| DB engineering | implemented | UUID PKs, FKs, checks, indexes, exclusion constraint, integer minor units, timestamptz + IANA zone, append-only triggers (audit, ledger, booking events). RLS N/A (no client DB access) — documented in SECURITY_PRIVACY.md; authorization tests are application-level |

## §7 API
| Item | Status | Notes |
|---|---|---|
| Route groups | partial | 63 route handlers (build output). Missing: `/api/search/courses`, `/api/bookings/[id]/reschedule`, `/api/submissions`, `/api/refunds` (admin route exists instead), `/api/payouts`, `/api/support/tickets` |
| Error envelope, ownership checks, rate limits, Origin/CSRF check | implemented | `docs/API.md`; smoke: 401 unauthenticated, 403 cross-site, 403 student→admin API |
| Canonical search serialization | implemented | test "serialises canonically" |

## §8 Maps
| Item | Status | Notes |
|---|---|---|
| 1 Autocomplete | not implemented | Nominatim forbids autocomplete; Mapbox adapter does button-triggered search only |
| 2–4 Geocoding, consented precise storage, approximate public coords | implemented (adapter) / blocked (live provider) | `src/lib/geo/*`, `/api/teachers/me/location`; no token configured |
| 5 Place/radius/bbox search | implemented | `teacher-search.ts` |
| 6 Accessible list, clustering, zero results, denied location | implemented | `src/components/teachers/teacher-map.tsx` (markercluster) — not browser-tested |
| 7 No required geolocation; manual city | implemented | `cities` fallback |
| 8 Booking-stage location reveal | partial | city-level only; exact address left to messages |
| 9 Attribution | implemented | `NEXT_PUBLIC_MAP_ATTRIBUTION` |
| 10 Edge-case tests | partial | privacy + invalid coordinates unit-tested; provider error/rate-limit cases not tested |

## §9 Security & privacy
Implemented: nonce CSP (scripts), staff TOTP, monitoring adapter, magic-byte checks on all uploads, guardian consent flow. Remaining gaps (`SECURITY_PRIVACY.md`): malware scanning (adapter point only), local-disk storage (S3 adapter to write), `'unsafe-inline'` for styles only, placeholder legal texts.

## §10 Screens
Public: implemented. Student: implemented (+ support, family access, assignments; invoices not generated). Teacher: partial (+ grading, group sessions; no student roster, analytics, reviews page). Admin: implemented (+ subjects, moderation, flags, support queue).

## §11 Testing
| Item | Status |
|---|---|
| Unit tests (all listed topics) | implemented — 49 tests |
| Integration tests (all 10 listed) | implemented — 38 tests; "paid files not available by guessing URLs" covered for credentials/course content |
| E2E 1–10 | implemented in CI: search→profile, signup/signin, booking to checkout (payment not configured) + free confirm, classroom token denied, admin verification + audit (with TOTP), RTL Arabic, mobile viewport, CSP/readiness, support internal notes |
| Performance / accessibility measurements | not implemented |

## §12 Phases
Phases 0–7 substantially done (with gaps above); Phase 8 (polish/production: e2e, a11y, monitoring, deployment) partial.

## §13 Documentation
| Doc | Status |
|---|---|
| README, LOCAL_SETUP, TESTING, DEPLOYMENT, IMPLEMENTATION_STATUS, HANDOVER, API, SECURITY_PRIVACY, PAYMENTS_AND_REFUNDS, MAPS_LOCATION_PRIVACY, CLASSROOM, TECH_DECISIONS, USER_GUIDE_STUDENT/TEACHER/ADMIN | present |
| PRODUCT_REQUIREMENTS.md, ARCHITECTURE.md (mermaid), DATABASE.md (ERD) | present |
| Demo videos | `demo-video.yml` → artifact `demo-scenes` (one video per scene) |

## Mobile / PWA
| Item | Status | Evidence |
|---|---|---|
| Installable PWA | implemented | `src/app/manifest.ts`, `public/icons/*`, `public/sw.js` (offline page, never caches API/private HTML), e2e "PWA manifest is linked" |
| Android/iOS store wrappers | implemented (unsigned builds) | `capacitor.config.ts` (loads `CAP_SERVER_URL`), `android/`, `ios/`, `mobile.yml` (debug APK artifact; iOS simulator build), `fastlane/Fastfile` lanes gated on signing secrets |
