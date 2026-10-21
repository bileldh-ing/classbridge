# Implementation status

Updated 21 Oct 2026. Status values: **implemented**, **partial** (partially implemented), **blocked** (needs something outside the repo), **not implemented**.
"Evidence" names routes, files, migrations and test names. Tests listed here passed in the last run (87/87, see `TESTING.md`). Migrations: `drizzle/0000_extensions.sql`, `0001_init.sql`, `0002_constraints.sql`. Provider-backed features were never exercised against the real provider (no credentials).

## §0 Execution rules / definition of done
| Requirement | Status | Evidence / notes |
|---|---|---|
| Real Postgres, versioned migrations, seed labelled demo | implemented | `drizzle/*.sql`, `scripts/migrate.ts`, `scripts/seed.ts` (all names "(Demo)", `users.is_demo`, demo reviews flagged) |
| Server-side adapters, no silent success when unconfigured | implemented | `src/lib/payments/*`, `src/lib/classroom/provider.ts`, `src/lib/geo/geocoding.ts`, `src/lib/email/*`; test "unconfigured provider: honest error, nothing charged, booking still held"; `/api/health` providers block |
| Lint / typecheck / unit / integration / build recorded honestly | implemented | `TESTING.md` |
| E2E tests | blocked | Playwright Chromium download returns 403 for linux-arm64 here |
| `TECH_DECISIONS.md` | implemented | `docs/TECH_DECISIONS.md` |

## §1 Roles
| Role | Status | Evidence |
|---|---|---|
| Visitor | implemented | public routes smoke-tested 200; drafts 404 |
| Student | implemented | `/dashboard`, `/lessons`, `/my-courses`, `/saved`, `/payments`, `/messages` |
| Teacher (same identity) | implemented | `user_roles`, `/api/auth/role`; test "role upgrade keeps a single identity" |
| Parent/guardian | not implemented | no tables or flows; platform must stay adult-only (18+ self-declaration at signup) |
| Institution/team | not implemented | — |
| Support moderator | partial | `support` role with least-privilege permissions (`src/lib/auth/permissions.ts`, test "support is least-privilege"); support ticket queue is read-only (no user-facing ticket form) |
| Administrator | partial | verification, users, refunds, reports, audit; no subject/category management, feature-flag UI or config UI |

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
| Realtime | not implemented | messages are persisted and fetched; no WebSocket push |
| LiveKit classroom | implemented (adapter) / blocked (live test) | `src/lib/classroom/provider.ts`; tests in `classroom-reviews.test.ts`; no LiveKit credentials |
| GeocodingProvider / MapProvider | partial | `GeocodingProvider` with Mapbox + Nominatim; map is Leaflet with configurable tiles (no separate `MapProvider` interface) |
| Payment/Refund/Payout provider interfaces | implemented (Stripe adapter) / blocked (live) | `src/lib/payments/provider.ts`, `stripe.ts`; payouts gated. Stripe does not support Tunisia (https://stripe.com/global) |
| CI (GitHub Actions) | not implemented | no `.github/workflows` |
| Error monitoring | not implemented | structured logs only (`src/lib/log.ts`) |
| Docker | not implemented | — |
| Health check, rate limiting, audit | implemented | `/api/health` (smoke 200), `rate_limits` table, `audit_log` (append-only trigger) |
| Optional AI off by default | implemented (as off) | `feature_flags.ai_features=false`; no AI features built |

## §3 Brand, UX, design system
| Item | Status | Evidence |
|---|---|---|
| Visual direction, responsive layouts | implemented | Tailwind kit; not visually audited in a browser in this session |
| WCAG 2.2 AA | partial | labels, focus rings, skip-to-main, semantic headings in code; **no axe/keyboard audit run** |
| EN/FR/AR with RTL | implemented | `src/lib/i18n/messages.ts` (type-checked completeness), `<html lang dir>` in `src/app/layout.tsx`, logical CSS props; RTL not visually tested |
| Role-specific navigation, permission-filtered links | implemented | `src/components/layout/app-shell.tsx` (admin links filtered by `perm`) |
| Nav items "Assignments", "Reviews", "Students", "Assessments", "Analytics", "Support queue", "Subjects", "Configuration" | not implemented | no pages for these |

## §4 Journeys
| Journey | Status | Notes |
|---|---|---|
| A — find & book | partial | search/filters/map/profile/slot picker/holds/booking/checkout/notifications/.ics/reminders/attendance/reviews/cancellation implemented and integration-tested; paid checkout untested against Stripe; "next available slot" on cards and timezone-compatible availability filter not verified; no rescheduling |
| B — teacher onboarding | implemented | `/become-a-teacher`, `/teach/profile`, `/teach/offerings`, `/teach/availability`, `/teach/credentials`, `/api/teachers/me/submit`, admin decision + badges; test "non-admins are refused; approval publishes and writes an immutable audit record". No malware scan |
| C — live lesson | partial | token authorization tested; room UI (`src/components/lessons/classroom.tsx`) never connected to a real LiveKit server |
| D — self-paced e-learning | partial | catalog, detail, enroll (free + paid via webhook), player, progress, quizzes, certificates (`/certificates/[code]`) tested; no notes/bookmarks, no written-answer questions/manual grading, no timed attempts, no assignments |
| E — support/admin | partial | reports + admin report actions + audit implemented; support tickets have no creation flow and no internal notes |

## §5 Functional specification
| Section | Status | Evidence / gaps |
|---|---|---|
| 5.1 Public site & SEO | partial | all listed pages return 200 (smoke); `sitemap.ts`, `robots.ts`, metadata + Open Graph on teacher pages; unpublished/unknown teacher → 404. Gaps: no JSON-LD, no city/subject landing pages (subject pages only), legal texts are placeholders |
| 5.2 Auth & account lifecycle | partial | signup/verify/login/reset/logout/logout-all/role upgrade/consents/privacy requests (`/api/privacy`); test "signup → verify email → login → session → reset password revokes sessions". Gaps: no OAuth, **no admin MFA**, export/erasure are recorded requests only (no automated job) |
| 5.3 Directory & search | implemented | `/api/search/teachers`, `src/lib/services/teacher-search.ts` (FTS + trgm, filters, sort, pagination, radius, bbox); test "filters server-side, paginates, excludes drafts, and never returns private positions". Distances rounded to 0.5 km (`roundPublicDistanceKm`, test "rounds to the nearest 0.5 km"). PostGIS replaced by earthdistance (documented) |
| 5.4 Profile & offerings | partial | published-only profile, completeness indicator, intro video, offerings CRUD with status/archive. Gaps: group capacity (group lessons flagged off), intake questions, portfolio samples |
| 5.5 Scheduling & bookings | partial | rules, exceptions, buffers, notice, max/day, DST (`slots.test.ts`), exclusion constraint (test "the database itself rejects overlapping active bookings"), state machine (`state-machine.test.ts`), append-only events, `.ics`. Gap: **rescheduling not implemented** |
| 5.6 Live classroom | partial | random room names, token endpoint checks, short TTL, attendance, events; gaps: device check page, whiteboard, network-quality indicator, cleanup job; no live test |
| 5.7 Courses & LMS | partial | course→sections→lessons, drafts/publish, reorder (`/api/teacher/courses/[id]/move`), server-side content protection (test "protects paid lesson content server-side and hides correct answers"), progress, quizzes (choice questions, attempt limits, shuffle), certificates. Gaps: notes/bookmarks, assignments/submissions, written answers + manual grading, announcements, learner list, signed URLs for course files, transcripts |
| 5.8 Messaging & notifications | partial | membership checks, blocking, rate limits, read state, notification centre, email outbox with idempotency; test "only conversation members can read/send; blocking stops sending". Gaps: attachments, realtime, notification preferences |
| 5.9 Reviews | partial | eligibility + one per booking (tests "requires a completed, attended booking…", "a no-show booking cannot be reviewed"), teacher response column, moderation status, distinct badges. Gap: review report flow UI |
| 5.10 Payments, refunds, earnings | partial / blocked | orders/items snapshots, webhook verify + idempotency, append-only ledger, provider-driven refunds, disputes recorded (`payments.test.ts`, `stripe-webhook.test.ts`). Blocked: live Stripe untested; Stripe unavailable for a Tunisian entity; **payouts gated off** (no withdraw, `payout_status='unavailable'`). Gaps: packages, invoices |
| 5.11 Optional AI | not implemented | flag off by default (allowed by spec) |
| 5.12 Admin & operations | partial | `/admin` metrics, users (suspend/reactivate with reason), teacher verification, bookings, payment events, refunds (retry), reports, audit log. Gaps: subject management, course moderation, feature-flag/config UI, email delivery log view, appeals, exports |

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
Partial — see `SECURITY_PRIVACY.md` "Known gaps": `'unsafe-inline'` CSP, no admin MFA, no malware scanning, local-disk storage, no error monitoring, placeholder legal texts, no minor/guardian safeguarding.

## §10 Screens
Public: implemented (all listed). Student: partial (no assignments/grades/support pages; invoices not generated). Teacher: partial (no student roster, assessments/grading, analytics, reviews page). Admin: partial (no subject management, course moderation, feature configuration, support queue actions).

## §11 Testing
| Item | Status |
|---|---|
| Unit tests (all listed topics) | implemented — 49 tests |
| Integration tests (all 10 listed) | implemented — 38 tests; "paid files not available by guessing URLs" covered for credentials/course content |
| E2E 1–10 | blocked (no browser) |
| Performance / accessibility measurements | not implemented |

## §12 Phases
Phases 0–7 substantially done (with gaps above); Phase 8 (polish/production: e2e, a11y, monitoring, deployment) partial.

## §13 Documentation
| Doc | Status |
|---|---|
| README, LOCAL_SETUP, TESTING, DEPLOYMENT, IMPLEMENTATION_STATUS, HANDOVER, API, SECURITY_PRIVACY, PAYMENTS_AND_REFUNDS, MAPS_LOCATION_PRIVACY, CLASSROOM, TECH_DECISIONS, USER_GUIDE_STUDENT/TEACHER/ADMIN | present |
| PRODUCT_REQUIREMENTS.md, ARCHITECTURE.md, DATABASE.md | not written |
| Screenshots | none (none generated from the running app) |
