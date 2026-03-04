-- Analysis Shares — shareable links for saved analyses
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS analysis_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id TEXT         NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  token       UUID UNIQUE  NOT NULL DEFAULT gen_random_uuid(),
  type        TEXT         NOT NULL CHECK (type IN ('internal', 'customer')),
  created_by  UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  view_count  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one share of each type per analysis
CREATE UNIQUE INDEX IF NOT EXISTS analysis_shares_analysis_type_idx
  ON analysis_shares (analysis_id, type);

CREATE INDEX IF NOT EXISTS analysis_shares_token_idx ON analysis_shares (token);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE analysis_shares ENABLE ROW LEVEL SECURITY;

-- Public can read shares (needed to serve share page)
CREATE POLICY "Public can read analysis shares"
  ON analysis_shares FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated users can create shares for their own analyses
CREATE POLICY "Users can create shares for own analyses"
  ON analysis_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Users can delete (revoke) their own shares
CREATE POLICY "Users can revoke own shares"
  ON analysis_shares FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ── Public read on analyses for share links ───────────────────────────────────
-- Allow anon to read an analysis only when a share token exists for it
CREATE POLICY "Public can read analyses via share token"
  ON analyses FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM analysis_shares
      WHERE analysis_shares.analysis_id = analyses.id
    )
  );

-- ── SECURITY DEFINER function ─────────────────────────────────────────────────
-- Fetches all share-page data in one call AND increments view count.
-- Runs with owner privileges so it can read profiles regardless of RLS.

CREATE OR REPLACE FUNCTION get_analysis_share_data(share_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_share    analysis_shares%ROWTYPE;
  v_analysis analyses%ROWTYPE;
  v_profile  profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_share FROM analysis_shares WHERE token = share_token;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE analysis_shares SET view_count = view_count + 1 WHERE token = share_token;

  SELECT * INTO v_analysis FROM analyses WHERE id = v_share.analysis_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_share.created_by;

  RETURN jsonb_build_object(
    'share', jsonb_build_object(
      'id',          v_share.id,
      'analysis_id', v_share.analysis_id,
      'token',       v_share.token,
      'type',        v_share.type,
      'view_count',  v_share.view_count + 1,
      'created_at',  v_share.created_at
    ),
    'analysis', jsonb_build_object(
      'id',                 v_analysis.id,
      'account_name',       v_analysis.account_name,
      'file_name',          v_analysis.file_name,
      'detected_format',    v_analysis.detected_format,
      'date_range_start',   v_analysis.date_range_start,
      'date_range_end',     v_analysis.date_range_end,
      'total_transactions', v_analysis.total_transactions,
      'total_gallons',      v_analysis.total_gallons,
      'total_spend',        v_analysis.total_spend,
      'data',               v_analysis.data
    ),
    'rep', jsonb_build_object(
      'full_name', v_profile.full_name,
      'email',     v_profile.email
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_analysis_share_data(UUID) TO anon, authenticated;
