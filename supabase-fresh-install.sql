-- ═════════════════════════════════════════════════════════════════════════════
-- Fleet Insights — fresh Supabase install
-- Run once in a NEW Supabase project: SQL Editor → paste → Run.
-- Creates every table, policy, function, trigger and storage bucket the app uses.
-- (The other *.sql files in the repo are historical patches for the old
--  database and reference a `proposals` table that no longer exists.)
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT        NOT NULL,
  full_name      TEXT,
  is_admin       BOOLEAN     NOT NULL DEFAULT false,
  is_super_admin BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_is_super_admin ON profiles(is_super_admin);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper functions (SECURITY DEFINER so policies on profiles don't recurse)
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin OR is_super_admin FROM profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_super_admin FROM profiles WHERE id = auth.uid()), false);
$$;

CREATE POLICY "Users can view own profile; admins view all" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR is_admin());

CREATE POLICY "Users can update own name" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  -- prevent users from promoting themselves
  WITH CHECK (
    auth.uid() = id
    AND is_admin       = (SELECT p.is_admin       FROM profiles p WHERE p.id = auth.uid())
    AND is_super_admin = (SELECT p.is_super_admin FROM profiles p WHERE p.id = auth.uid())
  );

-- Auto-create a profile row whenever a user is created/invited in Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── app_settings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        UNIQUE NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for app_settings" ON app_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert app_settings" ON app_settings
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update app_settings" ON app_settings
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete app_settings" ON app_settings
  FOR DELETE TO authenticated USING (is_admin());

INSERT INTO app_settings (key, value) VALUES
  ('footer_text',      'Professional Fleet Fuel Solutions'),
  ('terms_conditions', 'Standard Circle K Pro terms and conditions apply.'),
  ('product_images',   '{"fleet": null, "universal": null, "digital": null}'),
  ('hero_image',       'null'),
  ('feature_icons',    '{}')
ON CONFLICT (key) DO NOTHING;

-- ─── products_config (legacy, still read by lib/supabase/queries.ts) ─────────
CREATE TABLE IF NOT EXISTS products_config (
  id               TEXT    PRIMARY KEY,
  name             TEXT    NOT NULL,
  description      TEXT,
  default_features TEXT[]  NOT NULL DEFAULT '{}',
  display_order    INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE products_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for products_config" ON products_config
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can update products_config" ON products_config
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO products_config (id, name, description, default_features, display_order) VALUES
  ('fleet',     'Circle K Pro Fleet Card',                   'Circle K network only with 6,000+ locations nationwide', '{}', 1),
  ('universal', 'Circle K Pro Universal Card (WEX Network)', 'Multi-brand acceptance via WEX network',                 '{}', 2),
  ('digital',   'Digital+',                                  'Mobile app and digital fleet management tools',          '{}', 3)
ON CONFLICT (id) DO NOTHING;

-- ─── analyses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analyses (
  id                  TEXT          PRIMARY KEY,
  user_id             UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_name        TEXT          NOT NULL DEFAULT '',
  file_name           TEXT          NOT NULL DEFAULT '',
  detected_format     TEXT          NOT NULL DEFAULT '',
  total_transactions  INTEGER       NOT NULL DEFAULT 0,
  total_gallons       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_spend         NUMERIC(14,2) NOT NULL DEFAULT 0,
  date_range_start    TEXT,
  date_range_end      TEXT,
  status              TEXT          NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'archived')),
  data                JSONB         NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analyses_user_id_idx ON analyses (user_id, updated_at DESC);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses" ON analyses
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_super_admin());
CREATE POLICY "Users can create own analyses" ON analyses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own analyses" ON analyses
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON analyses
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── analysis_shares ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis_shares (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id TEXT        NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  token       UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL CHECK (type IN ('internal', 'customer')),
  created_by  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  view_count  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS analysis_shares_analysis_type_idx ON analysis_shares (analysis_id, type);
CREATE INDEX IF NOT EXISTS analysis_shares_token_idx ON analysis_shares (token);

ALTER TABLE analysis_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own shares" ON analysis_shares
  FOR SELECT TO authenticated USING (auth.uid() = created_by OR is_super_admin());
CREATE POLICY "Users can create shares for own analyses" ON analysis_shares
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can revoke own shares" ON analysis_shares
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Share page data: one call, increments view count, bypasses RLS by token only
CREATE OR REPLACE FUNCTION get_analysis_share_data(share_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ─── Storage bucket for admin image uploads ──────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('proposal-assets', 'proposal-assets', true, 2097152)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read proposal-assets" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'proposal-assets');
CREATE POLICY "Admins upload proposal-assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'proposal-assets' AND is_admin());
CREATE POLICY "Admins update proposal-assets" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'proposal-assets' AND is_admin());
CREATE POLICY "Admins delete proposal-assets" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'proposal-assets' AND is_admin());

-- ─── Make yourself super admin (after creating your user in Auth) ────────────
-- UPDATE profiles SET is_admin = true, is_super_admin = true
-- WHERE email = 'you@example.com';
