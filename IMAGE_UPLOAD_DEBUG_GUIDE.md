# Image Upload Debugging Guide

## Current Status

✅ **Working:**
- Image uploads to Supabase Storage are successful
- Admin panel displays uploaded images in preview
- Storage bucket (`proposal-assets`) is properly configured
- RLS policies for storage are in place
- Next.js Image configuration allows Supabase URLs

❌ **Not Working:**
- Image URLs are not being saved to the database
- `app_settings` table values remain null after upload
- Images don't display in generated proposals

## Root Cause Hypothesis

The `updateProductImage()` function is failing to save URLs to the database. Most likely causes:

1. **User's `is_admin` flag is false or null** (MOST LIKELY)
2. RLS policy blocking the UPDATE operation
3. Silent error in the database update query

## Debugging Steps

### Step 1: Run the SQL Script

Open Supabase SQL Editor and run the commands in `fix-admin-status.sql`:

```sql
-- Check your admin status
SELECT id, email, is_admin FROM profiles;
```

**Expected result:** Your user should have `is_admin = true`

If `is_admin` is `false` or `null`, run:

```sql
-- Replace with your actual email
UPDATE profiles
SET is_admin = true
WHERE email = 'your-email@example.com';
```

### Step 2: Log Out and Back In

After updating `is_admin`:
1. Log out of the application
2. Clear browser cache (optional but recommended)
3. Log back in
4. Verify you can access the Admin panel

### Step 3: Test Image Upload with Console Open

1. Open browser DevTools Console (press F12)
2. Navigate to Admin panel → Image Library
3. Upload a product image
4. Watch the console for messages starting with `[updateProductImage]`

**Expected console output:**

```
[updateProductImage] START - productId: fleet imageUrl: https://...
[updateProductImage] Current user: abc-123-xyz
[updateProductImage] User profile: {id: "abc-123", email: "user@example.com", is_admin: true}
[updateProductImage] Fetching current product_images from database...
[updateProductImage] Current setting: {value: "{"fleet":null,...}"} Fetch error: null
[updateProductImage] Parsed existing images: {fleet: null, universal: null, digital: null}
[updateProductImage] Updated images object: {fleet: "https://...", universal: null, digital: null}
[updateProductImage] Stringified for database: {"fleet":"https://...","universal":null,"digital":null}
[updateProductImage] SUCCESS - Image URL saved to database!
```

### Step 4: Verify Database Update

After successful upload, check the database:

```sql
SELECT key, value FROM app_settings WHERE key = 'product_images';
```

**Expected result:** The `value` column should contain JSON with your image URL:
```json
{"fleet": "https://xxx.supabase.co/storage/v1/object/public/proposal-assets/products/...", "universal": null, "digital": null}
```

### Step 5: Test Proposal Display

1. Create a new proposal through the builder
2. Select the product with the uploaded image
3. Generate the proposal
4. Verify the image displays correctly

## Common Issues and Solutions

### Issue: Console shows "FAIL - User is not admin"

**Solution:** Your `is_admin` flag is not set. Run Step 1 above.

### Issue: Console shows "FAIL - Database update error"

**Solution:** RLS policy issue. Run this SQL to verify policies:

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'app_settings' AND cmd = 'UPDATE';
```

You should see a policy that checks `profiles.is_admin = true`.

### Issue: No console logs appear at all

**Solution:** The function isn't being called. Check:
1. Are you logged in?
2. Can you see the Admin panel?
3. Is the image actually uploading (check Storage bucket)?

### Issue: "SUCCESS" in console but images still don't display

**Solution:** This is a rendering issue, not an upload issue. Check:
1. Is the proposal fetching image URLs from the database?
2. Are Next.js Image components configured correctly?
3. Check browser Network tab - are image requests being made?

## Environment Variables

Ensure these are set in Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=https://circlek.pro
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
```

After adding/changing environment variables, **redeploy the application**.

## Technical Details

### Database Schema

**profiles table:**
- `id` (uuid, primary key)
- `email` (text)
- `is_admin` (boolean) ← Must be TRUE for image uploads
- `created_at` (timestamp)

**app_settings table:**
- `id` (uuid, primary key)
- `key` (text, unique) ← 'product_images', 'hero_image', etc.
- `value` (text) ← JSON string
- `updated_at` (timestamp)

### RLS Policies on app_settings

- **SELECT**: Public read access (anyone can view)
- **INSERT/UPDATE/DELETE**: Only users where `profiles.is_admin = true`

### Storage Bucket Configuration

- **Name:** `proposal-assets`
- **Public:** Yes
- **File size limit:** 2MB
- **Folders:** `products/`, `hero/`, `icons/`

## Next Steps After Fix

Once image uploads work:

1. Upload all product images (Fleet Card, Universal Card, Digital+)
2. Upload hero image (if needed)
3. Upload feature icons (if needed)
4. Create a test proposal to verify display
5. Share proposal link to verify images load on external devices
6. Clear CDN cache if using Vercel's image optimization

## Contact

If issues persist after following all steps, provide:
1. Screenshot of console output during upload
2. SQL query result from `SELECT * FROM profiles;`
3. SQL query result from `SELECT * FROM app_settings WHERE key = 'product_images';`
4. Screenshot of Supabase Storage showing uploaded files
