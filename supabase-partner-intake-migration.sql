-- Partner Intake Form: submissions table + private storage bucket
-- Run in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS partner_intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  hq_location text NOT NULL,
  contact_name text NOT NULL,
  title text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  fleet_size integer NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer NOT NULL,
  signed_url_expires_at timestamptz,
  submitted_ip text,
  email_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_intake_submissions ENABLE ROW LEVEL SECURITY;

-- Submissions are written by the server route using the service-role key,
-- which bypasses RLS entirely — no INSERT policy is needed (or wanted) for
-- anon/authenticated roles here.

-- Admins can review submissions from within the app.
CREATE POLICY "Admins can view partner intake submissions"
ON partner_intake_submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Private bucket for uploaded transaction reports. Not public — files are
-- only reachable via short-lived signed URLs generated server-side.
INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-uploads', 'partner-uploads', false)
ON CONFLICT (id) DO NOTHING;
