/**
 * ClassBridge database schema (Drizzle ORM, PostgreSQL 17).
 * Constraints that Drizzle cannot express (exclusion constraints, append-only triggers,
 * earthdistance / full-text indexes) live in the custom SQL migrations under /drizzle.
 * Money: integer minor units + ISO-4217 currency. Time: timestamptz (UTC) + named IANA zone.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, uuid, text, timestamp, integer, boolean, jsonb, smallint, doublePrecision, bigint,
  primaryKey, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- enums
export const roleEnum = pgEnum("app_role", ["student", "teacher", "admin", "support"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "suspended", "deletion_requested", "deleted"]);
export const publishStateEnum = pgEnum("teacher_publish_state", ["draft", "pending_review", "published", "rejected", "suspended"]);
export const credentialStatusEnum = pgEnum("credential_status", ["submitted", "approved", "rejected"]);
export const badgeEnum = pgEnum("badge_type", ["identity_verified", "credential_reviewed", "platform_verified"]);
export const locationVisibilityEnum = pgEnum("location_visibility", ["private", "approximate", "public"]);
export const lessonModeEnum = pgEnum("lesson_mode", ["online", "in_person"]);
export const offeringTypeEnum = pgEnum("offering_type", ["trial", "one_to_one", "group"]);
export const offeringStatusEnum = pgEnum("offering_status", ["draft", "published", "archived"]);
export const exceptionKindEnum = pgEnum("availability_exception_kind", ["blocked", "extra"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "draft", "slot_held", "awaiting_payment", "confirmed", "in_progress", "completed",
  "expired", "canceled_by_student", "canceled_by_teacher", "payment_failed",
  "no_show_student", "no_show_teacher", "refund_pending", "refunded", "disputed",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "not_required", "created", "requires_action", "processing", "succeeded", "failed",
  "canceled", "partially_refunded", "refunded", "disputed",
]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent", "late"]);
export const reviewStatusEnum = pgEnum("review_status", ["published", "hidden", "flagged"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "paid", "failed", "canceled", "refunded", "partially_refunded"]);
export const refundStatusEnum = pgEnum("refund_status", ["requested", "pending", "succeeded", "failed", "canceled"]);
export const ledgerKindEnum = pgEnum("ledger_kind", ["lesson_earning", "platform_fee", "refund_reversal", "fee_reversal"]);
export const webhookStatusEnum = pgEnum("webhook_status", ["received", "processed", "ignored", "failed"]);
export const emailStatusEnum = pgEnum("email_status", ["queued", "sent", "failed", "not_configured", "dev_logged"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "reviewing", "actioned", "dismissed"]);
export const courseStatusEnum = pgEnum("course_status", ["draft", "published", "archived"]);
export const lessonContentEnum = pgEnum("course_lesson_type", ["text", "video", "resource", "link", "quiz"]);
export const tokenPurposeEnum = pgEnum("auth_token_purpose", ["verify_email", "reset_password"]);

// ---------------------------------------------------------------- identity & access
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  status: accountStatusEnum("status").notNull().default("active"),
  isDemo: boolean("is_demo").notNull().default(false),
  // Admin TOTP two-factor (secret AES-256-GCM encrypted with a key derived from AUTH_SECRET)
  totpSecretEnc: text("totp_secret_enc"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  totpLastStep: bigint("totp_last_step", { mode: "number" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256(token) — the raw token only lives in the httpOnly cookie
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activeRole: roleEnum("active_role").notNull().default("student"),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const authTokens = pgTable("auth_tokens", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: tokenPurposeEnum("purpose").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  country: text("country"),
  onboardingStep: text("onboarding_step").notNull().default("profile"),
  learningGoals: text("learning_goals"),
  isAdultConfirmed: boolean("is_adult_confirmed").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userRoles = pgTable("user_roles", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  status: text("status").notNull().default("active"),
  grantedBy: uuid("granted_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("user_roles_user_role_uq").on(t.userId, t.role)]);

export const consentRecords = pgTable("consent_records", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  consentType: text("consent_type").notNull(), // terms | privacy | marketing | recording
  policyVersion: text("policy_version").notNull(),
  value: boolean("value").notNull(),
  source: text("source").notNull(),
  createdAt: createdAt(),
}, (t) => [index("consent_user_idx").on(t.userId)]);

export const auditLog = pgTable("audit_log", {
  id: id(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  reason: text("reason"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("audit_created_idx").on(t.createdAt), index("audit_target_idx").on(t.targetType, t.targetId)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

export const privacyRequests = pgTable("privacy_requests", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // export | deletion
  status: text("status").notNull().default("open"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ---------------------------------------------------------------- taxonomy
export const subjectCategories = pgTable("subject_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameFr: text("name_fr").notNull(),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const subjects = pgTable("subjects", {
  id: id(),
  categoryId: uuid("category_id").notNull().references(() => subjectCategories.id),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameFr: text("name_fr").notNull(),
  nameAr: text("name_ar").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const cities = pgTable("cities", {
  id: id(),
  name: text("name").notNull(),
  country: text("country").notNull(), // ISO-3166 alpha-2
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  source: text("source").notNull(),
}, (t) => [uniqueIndex("cities_name_country_uq").on(t.name, t.country)]);

// ---------------------------------------------------------------- teacher domain
export const teacherProfiles = pgTable("teacher_profiles", {
  id: id(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  headline: text("headline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  teachingApproach: text("teaching_approach").notNull().default(""),
  yearsExperience: smallint("years_experience").notNull().default(0),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  levels: text("levels").array().notNull().default(sql`'{}'::text[]`),
  timezone: text("timezone").notNull().default("UTC"),
  hourlyRateMinor: integer("hourly_rate_minor").notNull().default(0),
  currency: text("currency").notNull().default("EUR"),
  offersOnline: boolean("offers_online").notNull().default(true),
  offersInPerson: boolean("offers_in_person").notNull().default(false),
  introVideoUrl: text("intro_video_url"),
  publishState: publishStateEnum("publish_state").notNull().default("draft"),
  reviewNote: text("review_note"),
  minNoticeMinutes: integer("min_notice_minutes").notNull().default(720),
  bufferMinutes: integer("buffer_minutes").notNull().default(10),
  maxLessonsPerDay: smallint("max_lessons_per_day").notNull().default(6),
  bookingHorizonDays: smallint("booking_horizon_days").notNull().default(28),
  cancellationPolicy: text("cancellation_policy").notNull().default("flex-24h-v1"),
  isDemo: boolean("is_demo").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("teacher_publish_idx").on(t.publishState),
  index("teacher_rate_idx").on(t.hourlyRateMinor),
  index("teacher_languages_gin").using("gin", t.languages),
  index("teacher_levels_gin").using("gin", t.levels),
  check("teacher_rate_nonneg", sql`${t.hourlyRateMinor} >= 0`),
  check("teacher_currency_iso", sql`${t.currency} ~ '^[A-Z]{3}$'`),
]);

export const teacherSubjects = pgTable("teacher_subjects", {
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").notNull().references(() => subjects.id),
  specialty: text("specialty"),
}, (t) => [primaryKey({ columns: [t.teacherId, t.subjectId] }), index("teacher_subjects_subject_idx").on(t.subjectId)]);

export const teacherCredentials = pgTable("teacher_credentials", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  issuer: text("issuer").notNull(),
  issuedYear: smallint("issued_year"),
  fileKey: text("file_key"), // private storage key — never returned by public APIs
  fileMime: text("file_mime"),
  status: credentialStatusEnum("status").notNull().default("submitted"),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("cred_teacher_idx").on(t.teacherId)]);

export const teacherBadges = pgTable("teacher_badges", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id, { onDelete: "cascade" }),
  badge: badgeEnum("badge").notNull(),
  grantedBy: uuid("granted_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("badge_teacher_idx").on(t.teacherId)]);

export const teacherLocations = pgTable("teacher_locations", {
  teacherId: uuid("teacher_id").primaryKey().references(() => teacherProfiles.id, { onDelete: "cascade" }),
  city: text("city").notNull(),
  country: text("country").notNull(),
  // Private: precise coordinates only stored when justified/consented (null for city-level)
  preciseLat: doublePrecision("precise_lat"),
  preciseLng: doublePrecision("precise_lng"),
  // Public representation, derived server-side (snapped grid / city centroid)
  approxLat: doublePrecision("approx_lat"),
  approxLng: doublePrecision("approx_lng"),
  visibility: locationVisibilityEnum("visibility").notNull().default("approximate"),
  source: text("source").notNull(), // mapbox | nominatim | city_list
  providerPlaceId: text("provider_place_id"),
  geocodedAt: timestamp("geocoded_at", { withTimezone: true }),
  updatedAt: updatedAt(),
}, (t) => [
  check("loc_lat_range", sql`${t.approxLat} IS NULL OR (${t.approxLat} BETWEEN -90 AND 90)`),
  check("loc_lng_range", sql`${t.approxLng} IS NULL OR (${t.approxLng} BETWEEN -180 AND 180)`),
]);

export const lessonOfferings = pgTable("lesson_offerings", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subjects.id),
  type: offeringTypeEnum("type").notNull().default("one_to_one"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  durationMinutes: smallint("duration_minutes").notNull(),
  priceMinor: integer("price_minor").notNull(),
  currency: text("currency").notNull(),
  mode: lessonModeEnum("mode").notNull().default("online"),
  capacity: smallint("capacity").notNull().default(1),
  cancellationPolicy: text("cancellation_policy").notNull().default("flex-24h-v1"),
  intakeQuestion: text("intake_question"),
  status: offeringStatusEnum("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("offering_teacher_idx").on(t.teacherId),
  check("offering_duration", sql`${t.durationMinutes} BETWEEN 15 AND 240`),
  check("offering_price_nonneg", sql`${t.priceMinor} >= 0`),
  check("offering_capacity", sql`${t.capacity} BETWEEN 1 AND 50`),
]);

export const availabilityRules = pgTable("availability_rules", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id, { onDelete: "cascade" }),
  weekday: smallint("weekday").notNull(), // ISO 1=Mon..7=Sun, in the teacher's timezone
  startMinute: smallint("start_minute").notNull(),
  endMinute: smallint("end_minute").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("avail_teacher_idx").on(t.teacherId),
  check("avail_weekday", sql`${t.weekday} BETWEEN 1 AND 7`),
  check("avail_minutes", sql`${t.startMinute} >= 0 AND ${t.endMinute} <= 1440 AND ${t.startMinute} < ${t.endMinute}`),
]);

export const availabilityExceptions = pgTable("availability_exceptions", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id, { onDelete: "cascade" }),
  kind: exceptionKindEnum("kind").notNull().default("blocked"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
}, (t) => [index("avail_exc_teacher_idx").on(t.teacherId, t.startsAt), check("avail_exc_range", sql`${t.startsAt} < ${t.endsAt}`)]);

// ---------------------------------------------------------------- bookings & lessons
export const bookings = pgTable("bookings", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => users.id),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id),
  offeringId: uuid("offering_id").notNull().references(() => lessonOfferings.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  studentTimezone: text("student_timezone").notNull(),
  mode: lessonModeEnum("mode").notNull(),
  status: bookingStatusEnum("status").notNull().default("draft"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("created"),
  attendanceStatus: attendanceStatusEnum("attendance_status"),
  priceMinor: integer("price_minor").notNull(),
  currency: text("currency").notNull(),
  platformFeeMinor: integer("platform_fee_minor").notNull().default(0),
  cancellationPolicy: text("cancellation_policy").notNull(),
  holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
  roomName: text("room_name").notNull().unique(),
  intakeAnswer: text("intake_answer"),
  idempotencyKey: text("idempotency_key"),
  groupSessionId: uuid("group_session_id"),
  rescheduleCount: smallint("reschedule_count").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("booking_teacher_start_idx").on(t.teacherId, t.startsAt),
  index("booking_student_start_idx").on(t.studentId, t.startsAt),
  index("booking_status_idx").on(t.status),
  uniqueIndex("booking_student_idem_uq").on(t.studentId, t.idempotencyKey),
  check("booking_range", sql`${t.startsAt} < ${t.endsAt}`),
  check("booking_price_nonneg", sql`${t.priceMinor} >= 0 AND ${t.platformFeeMinor} >= 0`),
]);

export const bookingEvents = pgTable("booking_events", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  fromStatus: bookingStatusEnum("from_status"),
  toStatus: bookingStatusEnum("to_status").notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  actorRole: text("actor_role").notNull(), // student | teacher | admin | system | provider
  reason: text("reason"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("booking_events_booking_idx").on(t.bookingId, t.createdAt)]);

export const attendanceRecords = pgTable("attendance_records", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  participantId: uuid("participant_id").notNull().references(() => users.id),
  status: attendanceStatusEnum("status").notNull(),
  markedBy: uuid("marked_by").notNull().references(() => users.id),
  markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("attendance_booking_participant_uq").on(t.bookingId, t.participantId)]);

export const lessonNotes = pgTable("lesson_notes", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  materialsUrl: text("materials_url"),
  visibleToStudent: boolean("visible_to_student").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("lesson_notes_booking_idx").on(t.bookingId)]);

export const classroomEvents = pgTable("classroom_events", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  userId: uuid("user_id").references(() => users.id),
  kind: text("kind").notNull(), // token_issued | token_denied | joined | left | ended
  detail: text("detail"),
  createdAt: createdAt(),
}, (t) => [index("classroom_events_booking_idx").on(t.bookingId)]);

export const reviews = pgTable("reviews", {
  id: id(),
  bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id),
  studentId: uuid("student_id").notNull().references(() => users.id),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id),
  rating: smallint("rating").notNull(),
  body: text("body").notNull().default(""),
  teacherResponse: text("teacher_response"),
  status: reviewStatusEnum("status").notNull().default("published"),
  isDemo: boolean("is_demo").notNull().default(false),
  editableUntil: timestamp("editable_until", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("reviews_teacher_idx").on(t.teacherId, t.status), check("review_rating", sql`${t.rating} BETWEEN 1 AND 5`)]);

export const savedTeachers = pgTable("saved_teachers", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.teacherId] })]);

// ---------------------------------------------------------------- payments
export const orders = pgTable("orders", {
  id: id(),
  buyerId: uuid("buyer_id").notNull().references(() => users.id),
  status: orderStatusEnum("status").notNull().default("pending"),
  totalMinor: integer("total_minor").notNull(),
  currency: text("currency").notNull(),
  provider: text("provider").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("orders_buyer_idx").on(t.buyerId), check("order_total_nonneg", sql`${t.totalMinor} >= 0`)]);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  kind: text("kind").notNull(), // booking | course
  bookingId: uuid("booking_id").references(() => bookings.id),
  courseId: uuid("course_id"),
  description: text("description").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
}, (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_booking_idx").on(t.bookingId)]);

export const paymentIntents = pgTable("payment_intents", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"), // e.g. Stripe Checkout Session id
  providerPaymentRef: text("provider_payment_ref"), // e.g. Stripe PaymentIntent id
  status: paymentStatusEnum("status").notNull().default("created"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("payment_intent_provider_ref_uq").on(t.provider, t.providerRef), index("payment_intent_order_idx").on(t.orderId)]);

export const providerWebhookEvents = pgTable("provider_webhook_events", {
  id: id(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  status: webhookStatusEnum("status").notNull().default("received"),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("webhook_provider_event_uq").on(t.provider, t.eventId)]);

export const paymentEvents = pgTable("payment_events", {
  id: id(),
  paymentIntentId: uuid("payment_intent_id").notNull().references(() => paymentIntents.id),
  fromStatus: paymentStatusEnum("from_status"),
  toStatus: paymentStatusEnum("to_status").notNull(),
  sourceEventId: text("source_event_id"),
  createdAt: createdAt(),
}, (t) => [index("payment_events_pi_idx").on(t.paymentIntentId)]);

export const refunds = pgTable("refunds", {
  id: id(),
  paymentIntentId: uuid("payment_intent_id").notNull().references(() => paymentIntents.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  status: refundStatusEnum("status").notNull().default("requested"),
  reason: text("reason").notNull(),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("refunds_pi_idx").on(t.paymentIntentId), check("refund_amount_pos", sql`${t.amountMinor} > 0`)]);

export const teacherLedgerEntries = pgTable("teacher_ledger_entries", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  orderId: uuid("order_id").references(() => orders.id),
  kind: ledgerKindEnum("kind").notNull(),
  amountMinor: integer("amount_minor").notNull(), // signed
  currency: text("currency").notNull(),
  sourceRef: text("source_ref").notNull(), // provider event id → idempotency
  payoutStatus: text("payout_status").notNull().default("unavailable"),
  createdAt: createdAt(),
}, (t) => [
  index("ledger_teacher_idx").on(t.teacherId, t.createdAt),
  uniqueIndex("ledger_source_kind_uq").on(t.sourceRef, t.kind, t.teacherId),
]);

// ---------------------------------------------------------------- communications
export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link"),
  dedupeKey: text("dedupe_key").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey), index("notifications_unread_idx").on(t.userId, t.readAt)]);

export const emailOutbox = pgTable("email_outbox", {
  id: id(),
  toEmail: text("to_email").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  template: text("template").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: emailStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  providerMessageId: text("provider_message_id"),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("email_outbox_status_idx").on(t.status, t.sendAfter)]);

export const conversations = pgTable("conversations", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => users.id),
  teacherUserId: uuid("teacher_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
}, (t) => [uniqueIndex("conversation_pair_uq").on(t.studentId, t.teacherUserId)]);

export const conversationMembers = pgTable("conversation_members", {
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conv_members_user_idx").on(t.userId)]);

export const messages = pgTable("messages", {
  id: id(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
}, (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt), check("message_len", sql`char_length(${t.body}) BETWEEN 1 AND 4000`)]);

export const userReports = pgTable("user_reports", {
  id: id(),
  reporterId: uuid("reporter_id").references(() => users.id),
  targetType: text("target_type").notNull(), // teacher_profile | message | review | course | user
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: reportStatusEnum("status").notNull().default("open"),
  resolutionNote: text("resolution_note"),
  createdAt: createdAt(),
}, (t) => [index("reports_status_idx").on(t.status, t.createdAt)]);

export const supportTickets = pgTable("support_tickets", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  severity: text("severity").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  internalNote: text("internal_note"),
  category: text("category").notNull().default("general"),
  bookingId: uuid("booking_id").references(() => bookings.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("support_status_idx").on(t.status), index("support_user_idx").on(t.userId, t.createdAt)]);

export const supportTicketMessages = pgTable("support_ticket_messages", {
  id: id(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(false), // staff-only notes, never shown to the requester
  createdAt: createdAt(),
});

export const guardianLinks = pgTable("guardian_links", {
  id: id(),
  guardianId: uuid("guardian_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  learnerId: uuid("learner_id").references(() => users.id, { onDelete: "cascade" }),
  learnerEmail: text("learner_email").notNull(),
  status: text("status").notNull().default("pending"), // pending | active | declined | revoked
  canViewBookings: boolean("can_view_bookings").notNull().default(true),
  canViewProgress: boolean("can_view_progress").notNull().default(true),
  consentTokenHash: text("consent_token_hash").unique(),
  consentPolicyVersion: text("consent_policy_version"),
  consentedAt: timestamp("consented_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const groupSessions = pgTable("group_sessions", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id),
  offeringId: uuid("offering_id").notNull().references(() => lessonOfferings.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  capacity: smallint("capacity").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled | canceled
  roomName: text("room_name").notNull().unique(),
  createdAt: createdAt(),
});

export const messageAttachments = pgTable("message_attachments", {
  id: id(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id").notNull().references(() => users.id),
  storageKey: text("storage_key").notNull().unique(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  originalName: text("original_name").notNull(),
  createdAt: createdAt(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- courses / LMS
export const courses = pgTable("courses", {
  id: id(),
  teacherId: uuid("teacher_id").notNull().references(() => teacherProfiles.id),
  subjectId: uuid("subject_id").references(() => subjects.id),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  objectives: text("objectives").notNull().default(""),
  prerequisites: text("prerequisites").notNull().default(""),
  level: text("level").notNull().default("beginner"),
  language: text("language").notNull().default("en"),
  priceMinor: integer("price_minor").notNull().default(0),
  currency: text("currency").notNull().default("EUR"),
  status: courseStatusEnum("status").notNull().default("draft"),
  passingScorePct: smallint("passing_score_pct").notNull().default(70),
  isDemo: boolean("is_demo").notNull().default(false),
  moderationNote: text("moderation_note"),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("courses_status_idx").on(t.status), check("course_price_nonneg", sql`${t.priceMinor} >= 0`)]);

export const courseSections = pgTable("course_sections", {
  id: id(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull(),
}, (t) => [index("sections_course_idx").on(t.courseId, t.position)]);

export const courseLessons = pgTable("course_lessons", {
  id: id(),
  sectionId: uuid("section_id").notNull().references(() => courseSections.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: lessonContentEnum("type").notNull().default("text"),
  content: text("content").notNull().default(""), // protected: only served to enrolled users unless preview
  externalUrl: text("external_url"),
  isPreview: boolean("is_preview").notNull().default(false),
  durationMinutes: smallint("duration_minutes").notNull().default(5),
  position: integer("position").notNull(),
}, (t) => [index("course_lessons_section_idx").on(t.sectionId, t.position)]);

export const courseEnrollments = pgTable("course_enrollments", {
  id: id(),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  source: text("source").notNull(), // free | order
  orderId: uuid("order_id").references(() => orders.id),
  status: text("status").notNull().default("active"),
  lastLessonId: uuid("last_lesson_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("enrollment_course_user_uq").on(t.courseId, t.userId), index("enrollment_user_idx").on(t.userId)]);

export const lessonProgress = pgTable("lesson_progress", {
  userId: uuid("user_id").notNull().references(() => users.id),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.lessonId] })]);

export const quizzes = pgTable("quizzes", {
  id: id(),
  lessonId: uuid("lesson_id").notNull().unique().references(() => courseLessons.id, { onDelete: "cascade" }),
  maxAttempts: smallint("max_attempts").notNull().default(3),
  passingScorePct: smallint("passing_score_pct").notNull().default(70),
  shuffle: boolean("shuffle").notNull().default(true),
});

export const quizQuestions = pgTable("quiz_questions", {
  id: id(),
  quizId: uuid("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  kind: text("kind").notNull().default("single_choice"),
  explanation: text("explanation"),
  points: smallint("points").notNull().default(1),
  position: integer("position").notNull(),
});

export const questionOptions = pgTable("question_options", {
  id: id(),
  questionId: uuid("question_id").notNull().references(() => quizQuestions.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  isCorrect: boolean("is_correct").notNull().default(false), // never sent to students before submission
  position: integer("position").notNull(),
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: id(),
  quizId: uuid("quiz_id").notNull().references(() => quizzes.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  scorePct: smallint("score_pct").notNull(),
  passed: boolean("passed").notNull(),
  answers: jsonb("answers").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("attempts_quiz_user_idx").on(t.quizId, t.userId)]);

export const certificates = pgTable("certificates", {
  id: id(),
  code: text("code").notNull().unique(),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  recipientName: text("recipient_name").notNull(),
  courseTitle: text("course_title").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("certificate_course_user_uq").on(t.courseId, t.userId)]);


export const assignments = pgTable("assignments", {
  id: id(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  maxPoints: smallint("max_points").notNull().default(10),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Written answers. One per learner per assignment; resubmitting before grading replaces the text. */
export const assignmentSubmissions = pgTable("assignment_submissions", {
  id: id(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  status: text("status").notNull().default("submitted"), // submitted | graded
  points: smallint("points"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updatedAt(),
});

/** Append-only grading history: every (re)grade is a new row. */
export const submissionGrades = pgTable("submission_grades", {
  id: id(),
  submissionId: uuid("submission_id").notNull().references(() => assignmentSubmissions.id, { onDelete: "cascade" }),
  graderId: uuid("grader_id").notNull().references(() => users.id),
  points: smallint("points").notNull(),
  feedback: text("feedback").notNull().default(""),
  createdAt: createdAt(),
});

export const courseNotes = pgTable("course_notes", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("course_notes_user_lesson_uq").on(t.userId, t.lessonId)]);

export const courseBookmarks = pgTable("course_bookmarks", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.lessonId] })]);

export const courseAnnouncements = pgTable("course_announcements", {
  id: id(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});
