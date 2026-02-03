# User Management Guide

## How to Add New Users to the Proposal Builder

There is **no self-service signup** in this application. All users must be created by an administrator through the Supabase Dashboard.

---

## Step 1: Create User in Supabase

### Via Supabase Dashboard (Recommended)

1. **Go to your Supabase project dashboard**
   - Navigate to [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Select your `ck-proposal-builder` project

2. **Navigate to Authentication**
   - Click on **Authentication** in the left sidebar
   - Click on **Users** tab

3. **Add New User**
   - Click the **"Add User"** button
   - Choose **"Create new user"**

4. **Fill in User Details**
   - **Email**: Enter the user's email address (e.g., `john.smith@company.com`)
   - **Password**: Enter a temporary password (e.g., `TempPass123!`)
   - **Auto Confirm User**: ✅ Check this box (important!)
   - Click **"Create User"**

5. **Copy the User ID**
   - After creation, you'll see the new user in the list
   - Click on the user to view details
   - **Copy the UUID** (it looks like: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
   - You'll need this for the next step

---

## Step 2: Create Profile and Set Admin Status

### Via Supabase SQL Editor

1. **Go to SQL Editor**
   - In your Supabase dashboard
   - Click on **SQL Editor** in the left sidebar
   - Click **"New query"**

2. **Run this SQL to create the user's profile:**

```sql
-- Replace with actual values from Step 1
INSERT INTO profiles (id, email, full_name, is_admin, created_at)
VALUES (
  'PASTE-USER-ID-HERE',           -- The UUID from Step 1
  'user@company.com',              -- User's email
  'John Smith',                    -- User's full name
  true,                            -- Set to true for admin, false for regular user
  NOW()
);
```

**Example with real values:**
```sql
INSERT INTO profiles (id, email, full_name, is_admin, created_at)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'john.smith@circlek.com',
  'John Smith',
  true,
  NOW()
);
```

3. **Click "Run"** to execute the query

4. **Verify the profile was created:**
```sql
SELECT id, email, full_name, is_admin, created_at
FROM profiles
WHERE email = 'john.smith@circlek.com';
```

---

## Step 3: User First Login

### User receives credentials and sets their own password

1. **Share credentials with the user:**
   - Email: `john.smith@circlek.com`
   - Temporary Password: `TempPass123!`
   - Login URL: `https://circlek.pro/login`

2. **User logs in:**
   - User goes to https://circlek.pro/login
   - Enters email and temporary password
   - Successfully logs in

3. **User changes password (IMPORTANT):**
   - After first login, user should immediately change password
   - User can do this via Supabase's password reset flow:

   **Password Reset Process:**
   - User clicks "Forgot Password?" on login page (if available)
   - OR administrator sends password reset link via Supabase Dashboard:
     - Authentication → Users
     - Click on the user
     - Click "Send Password Reset Email"

   - User receives email with reset link
   - User clicks link and sets their own password

---

## Quick Reference: Admin vs Regular User

### Admin Users (`is_admin = true`)
- Can access Admin Panel
- Can modify product configurations
- Can upload/manage images
- Can change app settings
- Can permanently delete proposals
- Can create/edit/delete proposals

### Regular Users (`is_admin = false`)
- Can create/edit/delete their own proposals
- Can view the dashboard
- Can generate PDFs
- Cannot access admin panel
- Cannot modify system settings

---

## Make Existing User an Admin

If you need to promote an existing user to admin:

```sql
-- Find the user's ID
SELECT id, email, is_admin FROM profiles WHERE email = 'user@company.com';

-- Update to admin
UPDATE profiles
SET is_admin = true
WHERE email = 'user@company.com';

-- Verify the change
SELECT id, email, is_admin FROM profiles WHERE email = 'user@company.com';
```

**Important:** User must log out and log back in for admin status to take effect.

---

## Remove Admin Access

To demote an admin to regular user:

```sql
UPDATE profiles
SET is_admin = false
WHERE email = 'user@company.com';
```

---

## List All Users

To see all users and their admin status:

```sql
SELECT
  id,
  email,
  full_name,
  is_admin,
  created_at
FROM profiles
ORDER BY created_at DESC;
```

---

## Troubleshooting

### User can't log in
1. Verify user exists in Authentication → Users
2. Check if user is confirmed (should show "Confirmed")
3. Verify profile exists in database:
   ```sql
   SELECT * FROM profiles WHERE email = 'user@company.com';
   ```

### User sees "Not authorized" or can't access features
1. Check admin status:
   ```sql
   SELECT id, email, is_admin FROM profiles WHERE email = 'user@company.com';
   ```
2. If admin status is correct, ask user to log out and log back in
3. Clear browser cache/cookies

### Profile doesn't exist
If authentication exists but profile is missing, create it:
```sql
-- Get the user ID from Authentication → Users in Supabase Dashboard
-- Then create profile:
INSERT INTO profiles (id, email, full_name, is_admin, created_at)
VALUES ('USER-ID-FROM-AUTH', 'user@company.com', 'Full Name', false, NOW());
```

---

## Security Notes

1. **Never share the same temporary password with multiple users**
2. **Always use strong temporary passwords** (min 8 chars, uppercase, lowercase, number, symbol)
3. **Remind users to change their password immediately** after first login
4. **Limit admin access** - only give admin privileges to users who need it
5. **Audit admin users regularly** - review who has admin access quarterly

---

## Password Reset for Existing Users

If a user forgets their password:

1. **Via Supabase Dashboard:**
   - Go to Authentication → Users
   - Click on the user
   - Click **"Send Password Reset Email"**
   - User receives email with reset link

2. **Via SQL (if email isn't working):**
   ```sql
   -- Temporarily reset password to known value
   -- Note: This requires Supabase CLI or dashboard access
   ```
   Then inform the user of the temporary password and ask them to reset it.

---

## Future Enhancements

Consider implementing these features for easier user management:

- [ ] Admin UI for user management (add users without SQL)
- [ ] Invite users via email (they set password during signup)
- [ ] Bulk user import from CSV
- [ ] Role-based permissions (beyond just admin/user)
- [ ] User activity logs
- [ ] Password complexity requirements
- [ ] Two-factor authentication (2FA)

---

## Summary

**To add a new admin user:**
1. Create user in Supabase Authentication
2. Run SQL to create profile with `is_admin = true`
3. Share temporary credentials with user
4. User logs in and resets password

**To add a regular user:**
1. Same as above, but set `is_admin = false` in SQL

**Users set their own passwords:**
- Initially: Use temporary password provided by admin
- Then: Use password reset flow to set their own secure password
