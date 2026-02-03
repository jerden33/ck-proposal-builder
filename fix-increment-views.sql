-- Create the increment_proposal_views function if it doesn't exist
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION increment_proposal_views(proposal_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE proposals
  SET
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE id = proposal_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_proposal_views(TEXT) TO authenticated;

-- Also grant to anon users since proposals can be viewed without auth
GRANT EXECUTE ON FUNCTION increment_proposal_views(TEXT) TO anon;
