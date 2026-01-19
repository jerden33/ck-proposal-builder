# Supabase Storage Setup Guide

This guide walks you through setting up the image storage bucket for the Circle K Pro Proposal Builder.

## 1. Create Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **Create a new bucket**
4. Configure the bucket:
   - **Name:** `proposal-assets`
   - **Public bucket:** ✅ **Yes** (check this box)
   - **File size limit:** 2MB
   - **Allowed MIME types:** Leave blank (we validate in code)

## 2. Set Up Folder Structure

The bucket will automatically create folders when files are uploaded to these paths:
- `products/` - Product card images (fleet, universal, digital)
- `hero/` - Hero banner images
- `icons/` - Feature icons (future use)

No manual folder creation needed - they're created automatically on first upload.

## 3. Storage Policies (Public Bucket)

Since you selected "Public bucket" during creation, the following policies are automatically configured:

**Read Access (Public):**
```sql
-- Anyone can view/download images
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'proposal-assets');
```

**Upload Access (Authenticated Only):**
```sql
-- Only authenticated users can upload
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'proposal-assets');
```

**Delete Access (Authenticated Only):**
```sql
-- Only authenticated users can delete
CREATE POLICY "Authenticated users can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'proposal-assets');
```

**Update Access (Authenticated Only):**
```sql
-- Only authenticated users can update
CREATE POLICY "Authenticated users can update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'proposal-assets');
```

## 4. Verify Setup

To verify your storage bucket is configured correctly:

1. **Test Upload:**
   - Log in to your app as an admin
   - Go to Admin Panel → Image Library
   - Try uploading an image
   - You should see a preview after successful upload

2. **Test Public Access:**
   - Copy an uploaded image URL
   - Open it in an incognito/private browser window
   - The image should load without authentication

3. **Check Console:**
   - If uploads fail, check browser console for errors
   - Common issues:
     - Bucket doesn't exist: Create the bucket named `proposal-assets`
     - Permission denied: Ensure "Public bucket" is enabled
     - CORS errors: Usually auto-configured for public buckets

## 5. Environment Variables

Ensure these are set in your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 6. File Specifications

### Product Images
- **Recommended size:** 600×400px
- **Aspect ratio:** 3:2
- **Max file size:** 2MB
- **Formats:** JPG, PNG, WebP, SVG

### Hero Image
- **Recommended size:** 1920×600px
- **Aspect ratio:** 16:5
- **Max file size:** 2MB
- **Formats:** JPG, PNG, WebP, SVG

## 7. Troubleshooting

### "Upload failed" error
- Check that bucket name is exactly `proposal-assets`
- Verify bucket is marked as public
- Check file size is under 2MB
- Ensure file format is JPG, PNG, WebP, or SVG

### Images not displaying in proposals
- Check that image URLs are saved to `app_settings` table
- Verify the URLs are publicly accessible
- Check browser console for CORS or 404 errors

### Permission denied errors
- Ensure user is authenticated (logged in)
- Verify storage policies are created (step 3)
- Check that bucket is set to public

## 8. Next Steps

After completing this setup:

1. Run the SQL migrations in `supabase-setup.sql` to add image settings to your database
2. Deploy your application with the updated code
3. Log in as an admin and test uploading images
4. Create a proposal and verify images appear correctly
