-- 1. Double-booking prevention at the database level.
-- A teacher (and a student) cannot hold two overlapping bookings in a slot-occupying state.
ALTER TABLE bookings ADD CONSTRAINT bookings_teacher_no_overlap
  EXCLUDE USING gist (teacher_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('slot_held','awaiting_payment','confirmed','in_progress','completed','no_show_student','no_show_teacher','disputed'));--> statement-breakpoint
ALTER TABLE bookings ADD CONSTRAINT bookings_student_no_overlap
  EXCLUDE USING gist (student_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('slot_held','awaiting_payment','confirmed','in_progress'));--> statement-breakpoint

-- 2. Append-only tables: history, audit, money movements and submitted quiz attempts are immutable.
CREATE OR REPLACE FUNCTION cb_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;--> statement-breakpoint
CREATE TRIGGER booking_events_append_only BEFORE UPDATE OR DELETE ON booking_events FOR EACH ROW EXECUTE FUNCTION cb_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION cb_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER payment_events_append_only BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION cb_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON teacher_ledger_entries FOR EACH ROW EXECUTE FUNCTION cb_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER quiz_attempts_append_only BEFORE UPDATE OR DELETE ON quiz_attempts FOR EACH ROW EXECUTE FUNCTION cb_forbid_mutation();--> statement-breakpoint

-- 3. Search indexes
CREATE INDEX teacher_fts_idx ON teacher_profiles USING gin (
  to_tsvector('simple', coalesce(headline,'') || ' ' || coalesce(bio,'') || ' ' || coalesce(teaching_approach,''))
);--> statement-breakpoint
CREATE INDEX teacher_headline_trgm_idx ON teacher_profiles USING gin (headline gin_trgm_ops);--> statement-breakpoint
CREATE INDEX profiles_display_name_trgm_idx ON profiles USING gin (display_name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX subjects_name_trgm_idx ON subjects USING gin (name_en gin_trgm_ops);--> statement-breakpoint
-- Radius search on the PUBLIC approximate coordinates (earthdistance, metres)
CREATE INDEX teacher_locations_earth_idx ON teacher_locations USING gist (ll_to_earth(approx_lat, approx_lng))
  WHERE approx_lat IS NOT NULL AND approx_lng IS NOT NULL;--> statement-breakpoint
CREATE INDEX courses_fts_idx ON courses USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')));
