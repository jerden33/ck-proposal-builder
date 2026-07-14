-- Adds an optional free-text notes field to the partner intake form.
-- Run in the Supabase SQL Editor after the earlier partner intake migrations.

ALTER TABLE partner_intake_submissions
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
