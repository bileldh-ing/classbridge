# API reference

All endpoints are Next.js Route Handlers under `/api`. JSON in, JSON out.

**Error envelope** (every non-2xx): `{ "error": { "code": "SLOT_UNAVAILABLE", "message": "…", "details"?: … } }`

| code | HTTP | meaning |
|---|---|---|
| UNAUTHENTICATED | 401 | no/invalid session |
| FORBIDDEN | 403 | authenticated but not permitted (also cross-site requests) |
| NOT_FOUND | 404 | missing **or not visible to you** (private objects are not distinguishable from missing) |
| VALIDATION_FAILED | 422 | Zod validation; `details` lists `{path,message}` |
| CONFLICT | 409 | duplicate / concurrent change |
| SLOT_UNAVAILABLE | 409 | slot taken (exclusion constraint) or not in availability |
| HOLD_EXPIRED | 410 | checkout hold expired |
| INVALID_TRANSITION | 409 | booking state machine refused the change |
| NOT_ELIGIBLE | 403 | business rule (e.g. review before completion) |
| OUTSIDE_JOIN_WINDOW | 403 | classroom not open |
| RATE_LIMITED | 429 | DB-backed fixed-window limiter |
| PAYMENT_PROVIDER_NOT_CONFIGURED / CLASSROOM_PROVIDER_NOT_CONFIGURED / GEOCODER_NOT_CONFIGURED | 503 | provider credentials absent — nothing was charged/issued |
| PROVIDER_ERROR | 502 | provider rejected the call |
| BAD_SIGNATURE | 400 | webhook signature invalid |

**Auth**: httpOnly `cb_session` cookie. **CSRF**: every cookie-authenticated non-GET request must carry an `Origin` matching the host (or `Sec-Fetch-Site: same-origin`); combined with `SameSite=Lax`. Webhooks are exempt (signature-authenticated). **Content type**: JSON bodies require `application/json`, max 64 KB (credential upload: multipart, max 5 MB).

Dates in responses are epoch milliseconds unless stated.

## Auth & account
| Method | Path | Auth | Body / query | Notes |
|---|---|---|---|---|
| POST | /api/auth/signup | public | `{displayName,email,password,timezone,locale,acceptTerms:true,confirmAdult:true,marketingOptIn}` | 201, sets cookie, records consents, queues verification email. Rate limit 10/h/IP |
| POST | /api/auth/login | public | `{email,password}` | 30/15 min per IP, 10/15 min per email; generic error message |
| POST | /api/auth/logout | session | – | revokes current session |
| POST | /api/auth/logout-all | session | – | revokes all *other* sessions |
| POST | /api/auth/forgot | public | `{email}` | always 200 (no account enumeration); 3/h/email |
| POST | /api/auth/reset | public | `{token,password}` | single-use, 1 h; revokes all sessions |
| POST | /api/auth/verify | public | `{token}` | single-use, 48 h (POST so scanners can't consume) |
| POST | /api/auth/resend-verification | session | – | 3/h |
| POST | /api/auth/password | session | `{current,next}` | revokes other sessions |
| POST | /api/auth/role | session | `{role:"student"|"teacher"|"admin"}` | switches active context; must hold the role |
| PUT | /api/profile | session | `{displayName,timezone,learningGoals?}` | |
| POST | /api/locale | public | `{locale:"en"|"fr"|"ar"}` | cookie + profile |
| POST | /api/privacy | session | `{kind:"export"|"deletion"}` | recorded for staff; deletion deactivates the account |
| GET | /api/health | public | – | DB + provider configuration state (no secrets) |

## Discovery
| GET | /api/search/teachers | public | `q, subject, level, language, currency, minPrice, maxPrice, mode(online|in_person), city, lat, lng, radiusKm(1–300), bbox(w,s,e,n), minRating, verified, sort(relevance|price_asc|price_desc|rating|newest), page, pageSize(≤50)` | `{items,total,page,pageSize}`; positions are approximate only; 120/min/IP |
|---|---|---|---|---|
| GET | /api/subjects | public | – | taxonomy (EN/FR/AR names) |
| GET | /api/cities | public | – | manual city list (approximate centres) |
| GET | /api/availability | public | `offeringId, from, to` (≤31 days) | `{slots:[epochMs…], durationMinutes, teacherTimezone}` |
| GET | /api/geocode | teacher | `q, country?` | 503 GEOCODER_NOT_CONFIGURED when no provider; 20/min |

Example: `GET /api/search/teachers?subject=mathematics&mode=in_person&city=Tunis&radiusKm=25`

## Bookings, payments, classroom
| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | /api/bookings | `learn.book` | `{offeringId,startsAt(ISO),timezone,intakeAnswer?,idempotencyKey?}` | 201 `{id,status:"slot_held",holdExpiresAt}`; 409 SLOT_UNAVAILABLE; 20/h |
| GET | /api/bookings | session | – | own bookings as student |
| GET | /api/bookings/:id | participant/staff | – | detail + event history; 404 for others |
| POST | /api/bookings/:id/confirm-free | owning student | – | only price 0, hold valid |
| POST | /api/checkout | owning student | `{bookingId}` | `{url}` (Stripe Checkout) or 503 PAYMENT_PROVIDER_NOT_CONFIGURED; booking → awaiting_payment |
| POST | /api/bookings/:id/cancel | participant/admin | `{reason}` | policy-based refund → refund_pending + provider refund call |
| POST | /api/bookings/:id/complete | booking teacher | `{studentAttendance:"present"|"late"|"absent",note?,materialsUrl?}` | after start → completed / no_show_student |
| POST | /api/bookings/:id/notes | booking teacher | `{body,materialsUrl?}` | |
| GET | /api/bookings/:id/ics | participant | – | `text/calendar` |
| POST | /api/payments/webhook/:provider | provider signature | raw body | verifies `Stripe-Signature`, idempotent per event id; 200 `{received,duplicate,status}` |
| POST | /api/classrooms/:bookingId/token | participant | – | `{token,url,room,expiresInSeconds,role}`; 404 non-participant, 403 OUTSIDE_JOIN_WINDOW / NOT_ELIGIBLE, 503 not configured; 30/10 min |
| POST | /api/classrooms/:bookingId/events | participant | `{kind:"joined"|"left"}` | |

## Reviews, reports, saved, messaging, notifications
| POST | /api/reviews | `learn.review` | `{bookingId,rating 1–5,body}` | completed+attended booking, once |
|---|---|---|---|---|
| POST | /api/reports | public/session | `{targetType,targetId,reason,details?}` | 10/h; never auto-hides |
| POST/DELETE | /api/saved-teachers | session | `{teacherId}` | |
| GET/POST | /api/conversations | session | POST `{bookingId}` | conversation only between booking participants |
| GET/POST | /api/conversations/:id/messages | member | GET `?after=epochMs`; POST `{body ≤4000}` | 30 msgs/min |
| POST | /api/conversations/:id/block | member | `{blocked}` | |
| GET | /api/notifications | session | – | |
| POST | /api/notifications/read | session | – | mark all read |

## Teacher
| GET/POST/PUT | /api/teachers/me | GET/PUT `teach.manage_profile`; POST any user | PUT profile schema | POST = role upgrade (same identity) |
|---|---|---|---|---|
| PUT | /api/teachers/me/settings | teacher | `{minNoticeMinutes,bufferMinutes,maxLessonsPerDay,bookingHorizonDays}` | |
| PUT | /api/teachers/me/location | teacher | `{cityId}` or `{geocoded:{…},visibility,storePrecise}` | public point derived server-side |
| POST / PUT | /api/teachers/me/offerings[/:id] | teacher | offering schema (price in minor units) | |
| PUT | /api/availability | teacher | `{rules:[{weekday 1–7,startMinute,endMinute}]}` | overlap rejected |
| POST/DELETE | /api/availability/exceptions | teacher | `{kind,startsAt,endsAt,reason?}` / `{id}` | |
| POST | /api/teachers/me/submit | teacher | – | requires completeness + verified email |
| POST | /api/teachers/me/credentials | teacher | multipart `title, issuer, issuedYear?, file?` | PDF/PNG/JPEG by magic bytes, ≤5 MB, private storage |

## Courses (LMS)
| POST | /api/courses/:id/enroll | session | – | free → enrolled; paid → `{url}` checkout (enrollment only via verified webhook) |
|---|---|---|---|---|
| POST | /api/course-lessons/:id/complete | enrolled | – | returns certificate code when the course completes |
| POST | /api/quizzes/:id/attempts | enrolled | `{answers:{questionId:[optionId]}}` | attempt limit enforced under advisory lock; immutable |
| POST/PUT | /api/teacher/courses[/:id] | teacher (owner) | course schema | |
| POST | /api/teacher/courses/:id/status | owner | `{status}` | publish requires ≥1 lesson + approved teacher |
| POST | /api/teacher/courses/:id/sections · /lessons · /move · /questions | owner | see `src/lib/services/courses.ts` schemas | |

## Admin (`/api/admin/*`, permission-checked, every action audited with a reason)
| POST | /api/admin/teachers/:id/decision | admin.verify_teachers | `{decision:"approve"|"reject",reason}` |
|---|---|---|---|
| POST | /api/admin/teachers/:id/badges | admin.verify_teachers | `{badge,action:"grant"|"revoke",reason}` |
| POST | /api/admin/credentials/:id/decision | admin.verify_teachers | `{decision,reason}` (approve grants `credential_reviewed`) |
| GET | /api/admin/credentials/:id/file | owner or verifier | private file, `Content-Disposition: attachment`, access audited |
| POST | /api/admin/users/:id/status | admin.manage_users | `{status:"active"|"suspended",reason}` (suspension revokes sessions) |
| POST | /api/admin/refunds/:id/submit | admin.manage_refunds | – (send/retry refund at provider) |
| POST | /api/admin/reports/:id | admin.manage_reports | `{status,note,hideReview}` |

## Added in 0003 (production build)
Errors use the same envelope; new code `MFA_REQUIRED` (403) when a staff permission is used without a TOTP-verified session.

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | /api/bookings/:id/reschedule | participant | `{startsAt, reason}` | confirmed 1:1 only; student ≥24 h, teacher ≥2 h; max 2; atomic; 409 `SLOT_UNAVAILABLE` |
| GET/POST | /api/teacher/group-sessions | teacher | `{offeringId, startsAt}` | flag `group_lessons`; offering type `group`; no overlap with 1:1 or other sessions |
| POST | /api/group-sessions/:id/seats | learn.book | `{timezone}` | capacity under row lock; returns `{id, redirect}` to checkout; 409 when full / duplicate |
| GET/POST | /api/support/tickets | session | `{subject, body, category, bookingId?}` | 5/h per user; booking must be visible to the requester |
| GET | /api/support/tickets/:id | requester or staff | – | internal notes only for staff |
| POST | /api/support/tickets/:id/replies | requester or staff | `{body, internal}` | `internal:true` staff only (TOTP) |
| POST | /api/admin/support/:id | support.manage_tickets | `{status?, assignToMe?, reason}` | audited |
| POST | /api/admin/flags/:key | admin.manage_flags | `{enabled, reason}` | audited |
| GET/POST | /api/admin/taxonomy/categories[/:id] | admin.manage_subjects | category schema | slug unique |
| POST | /api/admin/taxonomy/subjects[/:id] | admin.manage_subjects | subject schema | |
| POST | /api/admin/courses/:id/moderate | admin.moderate_content | `{action:"unpublish"\|"restore", reason}` | owner notified |
| POST | /api/admin/teachers/:id/moderate | admin.moderate_content | `{action:"suspend"\|"reinstate", reason}` | |
| GET/POST | /api/guardian/links | session | `{learnerEmail, canViewBookings, canViewProgress}` | flag `guardian_links`; consent token only emailed/notified to the learner |
| POST | /api/guardian/consent | learner (email must match) | `{token, decision}` | records consent with policy version |
| POST | /api/guardian/links/:id/revoke | guardian or learner | – | |
| POST | /api/teacher/courses/:id/assignments | owner | `{title, instructions, maxPoints, dueAt?, lessonId?}` | |
| GET | /api/courses/:id/assignments | owner or enrolled | – | learners see only their own submission |
| POST | /api/assignments/:id/submissions | enrolled | `{body}` | replace until graded |
| POST | /api/submissions/:id/grade | owner | `{points, feedback}` | appends to grading history |
| GET | /api/submissions/:id/grades | learner or owner | – | full history |
| GET/POST | /api/course-lessons/:id/note | lesson access | `{body}` | private |
| POST | /api/course-lessons/:id/bookmark | lesson access | `{on}` | |
| POST | /api/teacher/courses/:id/announcements | owner | `{title, body}` | notifies active learners; 10/day |
| GET | /api/courses/:id/announcements | owner or enrolled | – | |
| POST | /api/conversations/:id/attachments | member | multipart `file`, `caption?` | PDF/PNG/JPEG/WebP by magic bytes, ≤5 MB |
| GET | /api/attachments/:id | member | – | `attachment`, `nosniff`, sandbox CSP, no-store |
| GET | /api/conversations/:id/stream | member | – | `text/event-stream`: `ready`, `message {messageId}` |
| POST | /api/auth/mfa/setup · /enable · /verify | staff session | `{code}` | TOTP RFC 6238; 10 attempts / 5 min |
| GET | /api/health/live · /api/health/ready | public | – | ready = DB reachable + all migrations applied (503 otherwise) |

OpenAPI generation is **not implemented**; the Zod schemas referenced above (in `src/lib/services/*` and `src/lib/validation/*`) are the source of truth.
