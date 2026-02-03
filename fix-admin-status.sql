-- SQL Script to Verify and Fix Admin Status
-- Run these commands in your Supabase SQL Editor

-- Step 1: Check current admin status for all users
SELECT id, email, is_admin, created_at
FROM profiles;

-- Step 2: If your user's is_admin is false or null, update it to true
-- Replace 'your-email@example.com' with your actual email address
UPDATE profiles
SET is_admin = true
WHERE email = 'your-email@example.com';

-- Step 3: Verify the update worked
SELECT id, email, is_admin
FROM profiles
WHERE email = 'your-email@example.com';

-- Step 4: Verify app_settings rows exist with correct structure
SELECT key, value, updated_at
FROM app_settings
WHERE key IN ('product_images', 'hero_image', 'feature_icons');

-- Step 5: If product_images doesn't exist or is invalid, recreate it
INSERT INTO app_settings (key, value, updated_at)
VALUES ('product_images', '{"fleet": null, "universal": null, "digital": null}', NOW())
ON CONFLICT (key)
DO UPDATE SET
  value = '{"fleet": null, "universal": null, "digital": null}',
  updated_at = NOW();

-- Step 6: Verify RLS policies are active
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'app_settings';

-- Step 7: Test that you can update app_settings (should return 1 row updated)
UPDATE app_settings
SET updated_at = NOW()
WHERE key = 'product_images';
