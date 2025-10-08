# Database Setup Required

Your Supabase database needs a few updates to work properly with the Labels feature. Please complete all three steps below.

**Important:** The application will check for the storage bucket but won't try to create it automatically. You must create it manually in your Supabase Dashboard.

## Step 1: Add Missing Column to Products Table

Go to your Supabase Dashboard → SQL Editor and run:

```sql
-- Add manual_expiry_date column to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'manual_expiry_date'
  ) THEN
    ALTER TABLE products ADD COLUMN manual_expiry_date date;
  END IF;
END $$;
```

## Step 2: Create Storage Bucket

In your Supabase Dashboard → Storage:

1. Click **New bucket**
2. Name: `labels`
3. Set as **Private** (not public)
4. File size limit: 50 MB

## Step 3: Add Storage Policies

In your Supabase Dashboard → SQL Editor, run:

```sql
-- Storage policies for the labels bucket
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'labels');

CREATE POLICY "Authenticated users can read files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'labels');

CREATE POLICY "Authenticated users can update files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'labels')
WITH CHECK (bucket_id = 'labels');

CREATE POLICY "Authenticated users can delete files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'labels');
```

## Verification

After completing these steps:

1. Refresh your application
2. Check the browser console - you should see "[Labels] Labels bucket found and ready"
3. You should NOT see any "Storage bucket setup failed" errors
4. Try uploading a file to test the setup

## Supabase Dashboard URLs

- Your Project: https://hxpbjtimdctvhxqulnce.supabase.co
- SQL Editor: https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql
- Storage: https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/storage/buckets
