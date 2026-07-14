-- Adds "submitted by" fields to the partner intake form, captured separately
-- from the fleet's own primary contact (contact_name / email).
-- Run in the Supabase SQL Editor after supabase-partner-intake-migration.sql.

ALTER TABLE partner_intake_submissions
  ADD COLUMN IF NOT EXISTS submitter_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS submitter_email text NOT NULL DEFAULT '';
