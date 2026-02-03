-- Debug Super Admin Setup
-- Run these queries in Supabase SQL Editor to diagnose the issue

-- Step 1: Check if is_super_admin column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- Step 2: Check your user's profile
SELECT
  id,
  email,
  full_name,
  is_admin,
  is_super_admin,
  created_at
FROM profiles
WHERE email = 'jb.henderson0@outlook.com';

-- Step 3: Check all proposals in the database
SELECT
  p.id,
  p.customer_name,
  p.status,
  p.user_id,
  p.created_at,
  prof.email as creator_email
FROM proposals p
LEFT JOIN profiles prof ON p.user_id = prof.id
ORDER BY p.created_at DESC
LIMIT 20;

-- Step 4: Check if there's a foreign key relationship
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'proposals';

-- Step 5: Test the query that getUserProposals() is running
-- Replace USER_ID with your actual user ID from Step 2
SELECT
  p.*,
  prof.email,
  prof.full_name
FROM proposals p
LEFT JOIN profiles prof ON p.user_id = prof.id
ORDER BY p.updated_at DESC;
