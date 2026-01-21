# Super Admin Setup Guide

## Overview

By default, users can only see their own proposals. This guide will help you create a **Super Admin** role that can view and manage ALL proposals from all users in the system.

---

## Option 1: Use Existing `is_admin` Flag (Recommended)

The simplest approach is to treat all admins as super admins who can see all proposals.

### Step 1: Update `getUserProposals()` Function

**File:** `/home/user/ck-proposal-builder/lib/supabase/queries.ts`

Find the `getUserProposals()` function (around line 33) and replace it with:

```typescript
export async function getUserProposals(): Promise<ProposalRecord[]> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return []

  // Check if user is admin
  const profile = await getUserProfile()

  // Admins can see all proposals, regular users only see their own
  const query = supabase
    .from('proposals')
    .select('*')
    .order('updated_at', { ascending: false })

  // If not admin, filter to only user's proposals
  if (!profile?.is_admin) {
    query.eq('user_id', user.id)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching proposals:', error)
    return []
  }

  return data as ProposalRecord[]
}
```

### Step 2: Update Dashboard to Show Proposal Owner

**File:** `/home/user/ck-proposal-builder/app/dashboard/page.tsx`

Around line 217, add the owner's email display for admins:

```typescript
{/* Customer Name */}
<h3 className="text-xl font-bold text-off-black mb-2 line-clamp-2">
  {proposal.customer_name}
</h3>

{/* Show proposal owner for admins */}
{profile?.is_admin && (
  <p className="text-xs text-gray-500 mb-2">
    Created by: {proposal.user_id}
  </p>
)}
```

**Better version with user email lookup:**

You'll need to join with the profiles table. Update `getUserProposals()`:

```typescript
export async function getUserProposals(): Promise<ProposalRecord[]> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return []

  // Check if user is admin
  const profile = await getUserProfile()

  // Admins can see all proposals with user info, regular users only see their own
  const query = supabase
    .from('proposals')
    .select(`
      *,
      profiles!proposals_user_id_fkey (
        email,
        full_name
      )
    `)
    .order('updated_at', { ascending: false })

  // If not admin, filter to only user's proposals
  if (!profile?.is_admin) {
    query.eq('user_id', user.id)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching proposals:', error)
    return []
  }

  return data as ProposalRecord[]
}
```

Then update the dashboard display:

```typescript
{/* Show proposal owner for admins */}
{profile?.is_admin && proposal.profiles && (
  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
    <User size={12} />
    {proposal.profiles.full_name || proposal.profiles.email}
  </p>
)}
```

### Step 3: Test

1. Log in as an admin user
2. Go to the dashboard
3. You should now see ALL proposals from all users

---

## Option 2: Add Separate `is_super_admin` Column (More Granular)

If you want to distinguish between regular admins and super admins:

### Step 1: Add Column to Database

Run this SQL in **Supabase SQL Editor**:

```sql
-- Add is_super_admin column to profiles table
ALTER TABLE profiles
ADD COLUMN is_super_admin BOOLEAN DEFAULT false;

-- Set yourself as super admin (replace with your email)
UPDATE profiles
SET is_super_admin = true
WHERE email = 'your-email@company.com';

-- Verify
SELECT id, email, is_admin, is_super_admin
FROM profiles
WHERE email = 'your-email@company.com';
```

### Step 2: Update Type Definition

**File:** `/home/user/ck-proposal-builder/lib/types.ts`

Find the `UserProfile` interface and add:

```typescript
export interface UserProfile {
  id: string
  email: string
  full_name?: string
  is_admin: boolean
  is_super_admin: boolean  // Add this line
  created_at: string
}
```

### Step 3: Update `getUserProposals()` Function

```typescript
export async function getUserProposals(): Promise<ProposalRecord[]> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return []

  // Check if user is super admin
  const profile = await getUserProfile()

  // Super admins can see all proposals, regular users only see their own
  const query = supabase
    .from('proposals')
    .select(`
      *,
      profiles!proposals_user_id_fkey (
        email,
        full_name
      )
    `)
    .order('updated_at', { ascending: false })

  // If not super admin, filter to only user's proposals
  if (!profile?.is_super_admin) {
    query.eq('user_id', user.id)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching proposals:', error)
    return []
  }

  return data as ProposalRecord[]
}
```

### Step 4: Update Dashboard Badge

Show "Super Admin" badge in the header:

```typescript
<p className="text-xs text-gray-500">
  {profile?.is_super_admin
    ? 'Super Administrator'
    : profile?.is_admin
    ? 'Administrator'
    : 'User'}
</p>
```

---

## Comparison

| Feature | Option 1: Use `is_admin` | Option 2: Separate `is_super_admin` |
|---------|-------------------------|-------------------------------------|
| **Setup** | No DB changes needed | Requires DB column |
| **Granularity** | All admins see all proposals | Only super admins see all |
| **Use Case** | Small team, all admins are trusted | Larger team, need separation |
| **Permissions** | Admins: Edit settings + See all proposals | Admins: Edit settings only<br>Super Admins: Everything |

---

## Recommended Approach

**For most users: Use Option 1** (treat `is_admin` as super admin)

- Simpler to implement
- No database schema changes
- Admins already have elevated privileges anyway
- Easy to understand and maintain

**Use Option 2 only if you need:**
- Admins who can manage settings but NOT see other users' proposals
- Multiple permission levels
- Audit trail separation

---

## Security Considerations

### RLS Policies Are Already Permissive

The current RLS policy allows **anyone** to read all proposals:

```sql
CREATE POLICY "Public read access for proposals"
ON proposals
FOR SELECT
TO anon, authenticated
USING (true);
```

This is intentional for shareable proposal links. The filtering happens in the **application layer** (queries), not the database layer.

### If You Want Database-Level Restrictions

To enforce super admin at the database level, you'd need to:

1. **Remove** the public read policy
2. **Add** separate policies for regular users and super admins

```sql
-- Remove existing public read policy
DROP POLICY IF EXISTS "Public read access for proposals" ON proposals;

-- Policy: Users can read their own proposals
CREATE POLICY "Users can read own proposals"
ON proposals
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Super admins can read all proposals
CREATE POLICY "Super admins can read all proposals"
ON proposals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_super_admin = true
  )
);

-- Policy: Public access for shareable links (anonymous users)
CREATE POLICY "Public read for shareable links"
ON proposals
FOR SELECT
TO anon
USING (true);
```

**⚠️ Warning:** This approach makes shareable links harder because authenticated non-admin users couldn't view shared proposals from other users.

---

## Testing

### Test as Super Admin:

1. Log in as super admin
2. Go to Dashboard
3. You should see proposals from ALL users
4. Each proposal should show the creator's name/email

### Test as Regular User:

1. Log in as regular user
2. Go to Dashboard
3. You should only see YOUR OWN proposals

### Test Shareable Links:

1. Create a proposal as User A
2. Copy the shareable link
3. Log in as User B (or log out)
4. Visit the link
5. Proposal should still display (public access)

---

## SQL Quick Commands

### Make someone a super admin:

```sql
UPDATE profiles
SET is_super_admin = true
WHERE email = 'user@company.com';
```

### Remove super admin status:

```sql
UPDATE profiles
SET is_super_admin = false
WHERE email = 'user@company.com';
```

### List all super admins:

```sql
SELECT id, email, full_name, is_admin, is_super_admin
FROM profiles
WHERE is_super_admin = true;
```

### List all proposals with owners:

```sql
SELECT
  p.id,
  p.customer_name,
  p.status,
  p.created_at,
  prof.email as creator_email,
  prof.full_name as creator_name
FROM proposals p
LEFT JOIN profiles prof ON p.user_id = prof.id
ORDER BY p.created_at DESC
LIMIT 50;
```

---

## Implementation Checklist

- [ ] Decide on Option 1 (use `is_admin`) or Option 2 (add `is_super_admin`)
- [ ] If Option 2: Run SQL to add column
- [ ] Update `getUserProposals()` function in `lib/supabase/queries.ts`
- [ ] Update types if using Option 2
- [ ] Update dashboard to show proposal owner for super admins
- [ ] Test with super admin account
- [ ] Test with regular user account
- [ ] Test shareable links still work
- [ ] Document who has super admin access

---

## Future Enhancements

Consider adding these features for better super admin experience:

- [ ] Filter proposals by user in dashboard
- [ ] Search by customer name across all users
- [ ] Proposal analytics dashboard (total proposals, by user, by status)
- [ ] Ability to edit any user's proposal
- [ ] Bulk operations (archive multiple proposals)
- [ ] Export all proposals to CSV
- [ ] Audit log of who created/edited each proposal
