-- 0003: rescheduling, group lessons, support threads, guardian links, LMS assignments/notes/bookmarks/announcements,
-- message attachments + realtime NOTIFY, admin TOTP, course moderation, default feature flags.

-- ---------------------------------------------------------------- group lessons
CREATE TABLE "group_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "teacher_id" uuid NOT NULL REFERENCES "teacher_profiles"("id"),
  "offering_id" uuid NOT NULL REFERENCES "lesson_offerings"("id"),
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "capacity" smallint NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "room_name" text NOT NULL UNIQUE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "group_session_range" CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "group_session_capacity" CHECK ("capacity" BETWEEN 2 AND 50),
  CONSTRAINT "group_session_status" CHECK ("status" IN ('scheduled','canceled'))
);--> statement-breakpoint
CREATE INDEX "group_sessions_teacher_idx" ON "group_sessions" ("teacher_id","starts_at");--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_teacher_no_overlap"
  EXCLUDE USING gist ("teacher_id" WITH =, tstzrange("starts_at","ends_at",'[)') WITH &&) WHERE ("status" = 'scheduled');--> statement-breakpoint

ALTER TABLE "bookings" ADD COLUMN "group_session_id" uuid REFERENCES "group_sessions"("id");--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reschedule_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Seats in a group session share the teacher's time range, so they are excluded from the 1:1 teacher overlap
-- constraint; group sessions have their own exclusion constraint and capacity is enforced under a row lock.
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_teacher_no_overlap";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_teacher_no_overlap"
  EXCLUDE USING gist ("teacher_id" WITH =, tstzrange("starts_at","ends_at",'[)') WITH &&)
  WHERE ("group_session_id" IS NULL AND "status" IN ('slot_held','awaiting_payment','confirmed','in_progress','completed','no_show_student','no_show_teacher','disputed'));--> statement-breakpoint
CREATE UNIQUE INDEX "booking_group_seat_uq" ON "bookings" ("group_session_id","student_id")
  WHERE "group_session_id" IS NOT NULL AND "status" IN ('slot_held','awaiting_payment','confirmed','in_progress');--> statement-breakpoint

-- ---------------------------------------------------------------- support
ALTER TABLE "support_tickets" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "booking_id" uuid REFERENCES "bookings"("id");--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "assigned_to" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "closed_at" timestamptz;--> statement-breakpoint
CREATE INDEX "support_user_idx" ON "support_tickets" ("user_id","created_at");--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "is_internal" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ticket_message_len" CHECK (char_length("body") BETWEEN 1 AND 4000)
);--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_idx" ON "support_ticket_messages" ("ticket_id","created_at");--> statement-breakpoint

-- ---------------------------------------------------------------- moderation / taxonomy
ALTER TABLE "subject_categories" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "moderation_note" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "moderated_at" timestamptz;--> statement-breakpoint

-- ---------------------------------------------------------------- guardians
CREATE TABLE "guardian_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guardian_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "learner_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "learner_email" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "can_view_bookings" boolean DEFAULT true NOT NULL,
  "can_view_progress" boolean DEFAULT true NOT NULL,
  "consent_token_hash" text UNIQUE,
  "consent_policy_version" text,
  "consented_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "guardian_status" CHECK ("status" IN ('pending','active','declined','revoked')),
  CONSTRAINT "guardian_not_self" CHECK ("guardian_id" <> "learner_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_open_link_uq" ON "guardian_links" ("guardian_id", lower("learner_email")) WHERE "status" IN ('pending','active');--> statement-breakpoint
CREATE INDEX "guardian_learner_idx" ON "guardian_links" ("learner_id");--> statement-breakpoint

-- ---------------------------------------------------------------- LMS
CREATE TABLE "assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "lesson_id" uuid REFERENCES "course_lessons"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "instructions" text NOT NULL,
  "max_points" smallint DEFAULT 10 NOT NULL,
  "due_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "assignment_points" CHECK ("max_points" BETWEEN 1 AND 1000)
);--> statement-breakpoint
CREATE INDEX "assignments_course_idx" ON "assignments" ("course_id");--> statement-breakpoint
CREATE TABLE "assignment_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assignment_id" uuid NOT NULL REFERENCES "assignments"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "points" smallint,
  "submitted_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "submission_len" CHECK (char_length("body") BETWEEN 1 AND 20000),
  CONSTRAINT "submission_status" CHECK ("status" IN ('submitted','graded'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "submission_assignment_user_uq" ON "assignment_submissions" ("assignment_id","user_id");--> statement-breakpoint
CREATE TABLE "submission_grades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL REFERENCES "assignment_submissions"("id") ON DELETE CASCADE,
  "grader_id" uuid NOT NULL REFERENCES "users"("id"),
  "points" smallint NOT NULL,
  "feedback" text DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "grade_points_nonneg" CHECK ("points" >= 0)
);--> statement-breakpoint
CREATE INDEX "grades_submission_idx" ON "submission_grades" ("submission_id","created_at");--> statement-breakpoint
CREATE TRIGGER submission_grades_append_only BEFORE UPDATE ON submission_grades FOR EACH ROW EXECUTE FUNCTION cb_forbid_mutation();--> statement-breakpoint
CREATE TABLE "course_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lesson_id" uuid NOT NULL REFERENCES "course_lessons"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "note_len" CHECK (char_length("body") BETWEEN 1 AND 10000)
);--> statement-breakpoint
CREATE UNIQUE INDEX "course_notes_user_lesson_uq" ON "course_notes" ("user_id","lesson_id");--> statement-breakpoint
CREATE TABLE "course_bookmarks" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lesson_id" uuid NOT NULL REFERENCES "course_lessons"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id","lesson_id")
);--> statement-breakpoint
CREATE TABLE "course_announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "announcements_course_idx" ON "course_announcements" ("course_id","created_at");--> statement-breakpoint

-- ---------------------------------------------------------------- messaging attachments + realtime
CREATE TABLE "message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "uploader_id" uuid NOT NULL REFERENCES "users"("id"),
  "storage_key" text NOT NULL UNIQUE,
  "mime" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "original_name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "attachment_size" CHECK ("size_bytes" BETWEEN 1 AND 5242880)
);--> statement-breakpoint
CREATE INDEX "attachments_message_idx" ON "message_attachments" ("message_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION cb_notify_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('cb_messages', json_build_object('c', NEW.conversation_id, 'm', NEW.id)::text);
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER messages_notify AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION cb_notify_message();--> statement-breakpoint

-- ---------------------------------------------------------------- admin two-factor
ALTER TABLE "users" ADD COLUMN "totp_secret_enc" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" timestamptz;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_last_step" bigint;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "mfa_verified_at" timestamptz;--> statement-breakpoint

-- ---------------------------------------------------------------- default feature flags (production-safe defaults)
INSERT INTO "feature_flags" ("key","enabled","description") VALUES
  ('ai_features', false, 'Optional AI assistants (off by default; no provider configured)'),
  ('group_lessons', false, 'Group lessons: teachers schedule sessions with capacity, students book seats'),
  ('guardian_links', false, 'Parent/guardian linking with learner consent and read-only permissions'),
  ('minor_accounts', false, 'Accounts for learners under 18 (keep OFF until safeguarding policy is approved)'),
  ('realtime_messaging', true, 'Server-sent events push for new messages')
ON CONFLICT ("key") DO NOTHING;
