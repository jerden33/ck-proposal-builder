-- ─── Analyses Table ──────────────────────────────────────────────────────────
-- Run this in your Supabase SQL editor to enable saved analyses.

CREATE TABLE IF NOT EXISTS analyses (
  id                  TEXT         PRIMARY KEY,
  user_id             UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_name        TEXT         NOT NULL DEFAULT '',
  file_name           TEXT         NOT NULL DEFAULT '',
  detected_format     TEXT         NOT NULL DEFAULT '',
  total_transactions  INTEGER      NOT NULL DEFAULT 0,
  total_gallons       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_spend         NUMERIC(14,2) NOT NULL DEFAULT 0,
  date_range_start    TEXT,
  date_range_end      TEXT,
  status              TEXT         NOT NULL DEFAULT 'saved'
                                   CHECK (status IN ('saved', 'archived')),
  data                JSONB        NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Users can read their own analyses; super admins can read all
CREATE POLICY "Users can view own analyses" ON analyses
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = TRUE
    )
  );

CREATE POLICY "Users can create own analyses" ON analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analyses" ON analyses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own analyses" ON analyses
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS analyses_user_id_idx ON analyses (user_id, updated_at DESC);
