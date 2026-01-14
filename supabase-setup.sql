-- Supabase Database Setup for Circle K Pro Proposal Builder
-- Run these SQL commands in your Supabase SQL Editor

-- Function to increment proposal views
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
GRANT EXECUTE ON FUNCTION increment_proposal_views(TEXT) TO anon;

-- Verify tables exist (should already be created):
-- 1. profiles (id, email, full_name, is_admin, created_at)
-- 2. proposals (id, user_id, customer_name, status, created_at, updated_at, last_viewed_at, view_count, data)
-- 3. products_config (id, name, description, default_features, display_order)
-- 4. app_settings (id, key, value, updated_at)

-- Insert default product configurations if not exists
INSERT INTO products_config (id, name, description, default_features, display_order)
VALUES
  ('fleet', 'Circle K Pro Fleet Card', 'Circle K network only with 6,000+ locations nationwide',
   ARRAY[
     'Real-time reporting and analytics',
     'PIN security and fraud protection',
     'Fuel-only restrictions available',
     'U.S.-based customer support',
     'Online account management',
     'Customizable spending controls',
     'No monthly fees',
     'Mobile app access'
   ], 1),
  ('universal', 'Circle K Pro Universal Card (WEX Network)', 'Multi-brand acceptance via WEX network',
   ARRAY[
     'Accepted at 90% of U.S. fuel sites',
     'WEX network access (95,000+ locations)',
     'Broader geographic coverage',
     'Flexible payment controls',
     'Enhanced reporting tools',
     'Multi-site acceptance',
     'Driver ID and odometer capture',
     'Fuel and maintenance purchases'
   ], 2),
  ('digital', 'Digital+', 'Mobile app and digital fleet management tools',
   ARRAY[
     'Mobile app for drivers and managers',
     'Digital receipts and expense tracking',
     'Live GPS fleet tracking',
     'Advanced analytics dashboard',
     'Route optimization insights',
     'Driver behavior monitoring',
     'Automated reporting',
     'Real-time alerts and notifications'
   ], 3)
ON CONFLICT (id) DO NOTHING;

-- Insert default app settings if not exists
INSERT INTO app_settings (key, value)
VALUES
  ('footer_text', 'Professional Fleet Fuel Solutions'),
  ('terms_conditions', 'Standard Circle K Pro terms and conditions apply.')
ON CONFLICT (key) DO NOTHING;
