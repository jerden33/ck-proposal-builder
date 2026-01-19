# Authentication & Database Setup Guide

## Overview

The Circle K Pro Proposal Builder now includes:
- **Invitation-only authentication** (no public signup)
- **Database integration** with Supabase
- **User dashboard** to manage all proposals
- **Admin panel** for product configuration
- **Clean shareable URLs** for proposals

---

## Quick Start

### 1. Environment Variables

Already configured in Vercel:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 2. Database Setup

Run the SQL in `supabase-setup.sql` in your Supabase SQL Editor:
1. Creates the `increment_proposal_views()` function
2. Inserts default product configurations
3. Inserts default app settings

**Tables (already created):**
- `profiles` - User profiles with admin flag
- `proposals` - All proposal data with metadata
- `products_config` - Default product features
- `app_settings` - Global app settings

### 3. Create First Admin User

In Supabase Dashboard:
1. Go to **Authentication** → **Users**
2. Click **Add User**
3. Enter email and password
4. After creation, go to **Table Editor** → **profiles**
5. Find the user's row and set `is_admin = true`

---

## Features Implemented

### 🔐 Login System
- **Location:** `/login`
- Email/password authentication only
- No signup page (invitation-only)
- Redirects to dashboard on success
- Message: "Don't have access? Contact your administrator"

### 📊 Dashboard
- **Location:** `/dashboard`
- **Features:**
  - View all proposals created by the user
  - Search by customer name
  - Filter by status (draft/shared/archived)
  - View proposal analytics (view count, last viewed)
  - Duplicate proposals
  - Archive proposals
  - Quick access to admin panel (for admins)

### 🏗️ Main Builder
- **Location:** `/` (requires auth)
- **Changes:**
  - Added navbar with user info and logout
  - Loads default product features from database
  - Saves proposals to database instead of URL encoding
  - Generates clean shareable URLs like `/proposal?id=abc123xyz`

### 👁️ Proposal View
- **Location:** `/proposal?id={id}`
- **Features:**
  - **Public access** - no login required
  - Fetches from database using proposal ID
  - Increments view count automatically
  - Same beautiful design as before
  - Works for anyone with the link

### ⚙️ Admin Panel
- **Location:** `/admin` (requires is_admin = true)
- **Product Management:**
  - Edit all 3 products (Fleet Card, Universal Card, Digital+)
  - Modify product names and descriptions
  - Add/remove/edit default features dynamically
  - No maximum feature limit (reasonable up to 10)
  - Changes apply to all new proposals

- **App Settings:**
  - Edit footer text
  - Edit terms & conditions
  - Other global settings

---

## User Flow

### For Regular Users:
1. Admin creates account in Supabase Dashboard
2. User receives credentials (email/password)
3. User logs in at `/login`
4. Redirected to `/dashboard`
5. Click "New Proposal" → goes to builder (`/`)
6. Create proposal → saves to database
7. Share clean URL with customer
8. Customer views proposal (no login needed)
9. User sees view count in dashboard

### For Admins:
All of the above, plus:
1. Access "Admin" button in navbar
2. Configure default product features
3. Edit app-wide settings
4. Changes apply to new proposals immediately

---

## Database Schema

### profiles
```sql
- id (uuid, PK, references auth.users)
- email (text)
- full_name (text, nullable)
- is_admin (boolean, default false)
- created_at (timestamp)
```

### proposals
```sql
- id (text, PK) -- Short nanoid like "abc123xyz"
- user_id (uuid, FK to profiles)
- customer_name (text)
- status (enum: 'draft', 'shared', 'archived')
- created_at (timestamp)
- updated_at (timestamp)
- last_viewed_at (timestamp, nullable)
- view_count (integer, default 0)
- data (jsonb) -- Full proposal data
```

### products_config
```sql
- id (text, PK) -- 'fleet', 'universal', 'digital'
- name (text)
- description (text)
- default_features (text[])
- display_order (integer)
```

### app_settings
```sql
- id (uuid, PK)
- key (text, unique)
- value (text)
- updated_at (timestamp)
```

---

## API Functions

All database operations are in `lib/supabase/queries.ts`:

### User Functions
- `getCurrentUser()` - Get current authenticated user
- `getUserProfile()` - Get user profile with admin flag

### Proposal Functions
- `getUserProposals()` - Get all proposals for current user
- `getProposal(id)` - Get proposal by ID (public)
- `createProposal(data)` - Create new proposal, returns clean URL
- `updateProposal(id, data)` - Update proposal
- `archiveProposal(id)` - Archive proposal
- `duplicateProposal(id)` - Duplicate existing proposal
- `incrementProposalViews(id)` - Increment view count

### Product Functions
- `getProductsConfig()` - Get all products with default features
- `updateProductConfig(id, updates)` - Update product (admin only)

### Settings Functions
- `getAppSettings()` - Get all app settings
- `getAppSetting(key)` - Get specific setting
- `updateAppSetting(key, value)` - Update setting (admin only)

---

## Security

### Row Level Security (RLS)
Already enabled on all tables. Policies ensure:
- Users can only see/edit their own proposals
- Admins can manage products and settings
- Anyone can view proposals (public links work)

### Authentication
- Middleware protects all routes except `/login` and `/proposal`
- Logged-in users redirected away from `/login`
- Non-logged-in users redirected to `/login`

### Admin Protection
Admin-only pages (`/admin`) check `is_admin` flag server-side.

---

## Migration Notes

### Old URL Format
```
/proposal?data=<long-base64-string>
```

### New URL Format
```
/proposal?id=abc123xyz
```

Old URLs will redirect to login page. All new proposals use clean IDs.

---

## Troubleshooting

### Can't log in
- Verify user exists in Supabase Auth
- Check environment variables in Vercel
- Ensure RLS policies are enabled

### Products not loading
- Run `supabase-setup.sql` to insert defaults
- Check `products_config` table has data
- View browser console for errors

### Proposal view fails
- Ensure `increment_proposal_views()` function exists
- Check RLS policies allow public reads on proposals
- Verify proposal ID exists in database

### Admin panel blocked
- Check user's `is_admin` flag in profiles table
- Verify admin is logged in
- Check browser console for auth errors

---

## Development

### Local Setup
1. Copy `.env.example` to `.env.local`
2. Add your Supabase credentials
3. Run `npm install`
4. Run `npm run dev`

### Testing Auth
1. Create test users in Supabase Dashboard
2. Set one as admin (`is_admin = true`)
3. Test login flow
4. Test admin panel access

---

## Next Steps

1. ✅ Run `supabase-setup.sql` in Supabase
2. ✅ Create first admin user
3. ✅ Test login flow
4. ✅ Create a test proposal
5. ✅ Verify proposal view works
6. ✅ Test admin panel (edit products)
7. ✅ Share proposal URL with team

---

## Support

For issues:
- Check Supabase logs
- View browser console
- Verify environment variables
- Ensure database functions exist
