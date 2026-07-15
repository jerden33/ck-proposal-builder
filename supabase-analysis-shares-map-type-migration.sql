-- Add "map" as a third analysis_shares type — a lightweight customer-facing
-- link showing only the fueling map and proximity breakdown (no rep contact,
-- no other panels/tabs). Run in Supabase SQL Editor after
-- supabase-analysis-shares-migration.sql.

ALTER TABLE analysis_shares DROP CONSTRAINT IF EXISTS analysis_shares_type_check;
ALTER TABLE analysis_shares ADD CONSTRAINT analysis_shares_type_check
  CHECK (type IN ('internal', 'customer', 'map'));
