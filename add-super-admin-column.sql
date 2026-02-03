-- Add Super Admin Column to Profiles Table
-- Run this in Supabase SQL Editor

-- Step 1: Add the is_super_admin column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Step 2: Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_super_admin ON profiles(is_super_admin);

-- Step 3: Make yourself a super admin (replace with your actual email)
UPDATE profiles
SET is_super_admin = true
WHERE email = 'your-email@company.com';

-- Step 4: Verify the change
SELECT
  id,
  email,
  full_name,
  is_admin,
  is_super_admin,
  created_at
FROM profiles
WHERE email = 'your-email@company.com';

-- Step 5: View all users with their roles
SELECT
  id,
  email,
  full_name,
  CASE
    WHEN is_super_admin THEN 'Super Admin'
    WHEN is_admin THEN 'Admin'
    ELSE 'User'
  END as role,
  is_admin,
  is_super_admin,
  created_at
FROM profiles
ORDER BY is_super_admin DESC, is_admin DESC, created_at ASC;
