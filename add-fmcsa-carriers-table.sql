-- OTR Prospects: FMCSA Carriers table
-- Run this in Supabase SQL Editor

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fmcsa_carriers (
  id                bigserial PRIMARY KEY,
  dot_number        text,
  legal_name        text NOT NULL,
  dba_name          text,
  address           text,
  city              text,
  state             char(2),
  zip               text,
  phone             text,
  power_units       integer NOT NULL DEFAULT 0,
  drivers           integer NOT NULL DEFAULT 0,
  carrier_operation text,
  cargo_carried     text,          -- raw pipe-separated string, e.g. "General Freight|Refrigerated Food"
  operating_status  text NOT NULL DEFAULT 'ACTIVE',
  mcs150_date       text,
  hm_flag           boolean NOT NULL DEFAULT false,
  pc_flag           boolean NOT NULL DEFAULT false,
  is_stale_mcs150   boolean NOT NULL DEFAULT false,
  opportunity_score integer NOT NULL DEFAULT 0,
  uploaded_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- Covers the most common filter combinations

CREATE INDEX IF NOT EXISTS fmcsa_state_idx         ON fmcsa_carriers(state);
CREATE INDEX IF NOT EXISTS fmcsa_status_idx        ON fmcsa_carriers(operating_status);
CREATE INDEX IF NOT EXISTS fmcsa_power_units_idx   ON fmcsa_carriers(power_units);
CREATE INDEX IF NOT EXISTS fmcsa_hm_flag_idx       ON fmcsa_carriers(hm_flag);
CREATE INDEX IF NOT EXISTS fmcsa_pc_flag_idx       ON fmcsa_carriers(pc_flag);
CREATE INDEX IF NOT EXISTS fmcsa_stale_idx         ON fmcsa_carriers(is_stale_mcs150);
CREATE INDEX IF NOT EXISTS fmcsa_score_idx         ON fmcsa_carriers(opportunity_score DESC);

-- Composite index for the default query pattern: state + status + score sort
CREATE INDEX IF NOT EXISTS fmcsa_state_status_score_idx
  ON fmcsa_carriers(state, operating_status, opportunity_score DESC);

-- Full-text index on city for the city search filter
CREATE INDEX IF NOT EXISTS fmcsa_city_idx ON fmcsa_carriers(city text_pattern_ops);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE fmcsa_carriers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read carriers
CREATE POLICY "Authenticated users can read FMCSA carriers"
  ON fmcsa_carriers FOR SELECT TO authenticated
  USING (true);

-- Only admins can write (insert, update, delete)
CREATE POLICY "Admins can manage FMCSA carriers"
  ON fmcsa_carriers FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- ── Truncate helper ───────────────────────────────────────────────────────────
-- SECURITY DEFINER lets it TRUNCATE (which requires higher privileges than DELETE)
-- while still enforcing the admin check at the application layer.

CREATE OR REPLACE FUNCTION truncate_fmcsa_carriers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can truncate the FMCSA dataset';
  END IF;
  TRUNCATE fmcsa_carriers RESTART IDENTITY;
END;
$$;
