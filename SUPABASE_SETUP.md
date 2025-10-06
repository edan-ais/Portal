# Supabase Storage Setup for Labels Tab

The Labels tab requires a Supabase Storage bucket to store uploaded files. Follow these steps to set it up:

## 1. Create Storage Bucket

1. Go to your Supabase Dashboard: https://0ec90b57d6e95fcbda19832f.supabase.co
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `labels`
   - **Public**: No (keep it private)
   - **File size limit**: 50 MB (52428800 bytes)
   - **Allowed MIME types**:
     - `application/pdf`
     - `image/jpeg`
     - `image/png`
     - `image/gif`
     - `image/webp`
     - `text/plain`

## 2. Configure Storage Policies (RLS)

After creating the bucket, you need to add Row Level Security policies:

1. In the Storage section, click on the `labels` bucket
2. Go to the **Policies** tab
3. Click **New policy** and add the following policies:

### Policy 1: Upload Files
```sql
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'labels');
```

### Policy 2: Read Files
```sql
CREATE POLICY "Authenticated users can read files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'labels');
```

### Policy 3: Update Files
```sql
CREATE POLICY "Authenticated users can update files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'labels')
WITH CHECK (bucket_id = 'labels');
```

### Policy 4: Delete Files
```sql
CREATE POLICY "Authenticated users can delete files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'labels');
```

## 3. Verify Setup

After setting up the bucket and policies:

1. Go to the Labels tab in your application
2. Open the browser console (F12)
3. Look for the message: `[Labels] Labels bucket found`
4. If you see a warning about the bucket not being found, double-check the bucket name is exactly `labels`

## 4. Test File Upload

1. Navigate to the Labels tab
2. Click on a folder (e.g., "Fudge")
3. Click "Add Files"
4. Select a PDF or image file
5. Watch the console for detailed logging of the upload process
6. A success notification should appear in the bottom-right corner

## Troubleshooting

### "Storage bucket not configured" error
- The `labels` bucket doesn't exist. Follow step 1 above.

### "Upload failed: new row violates row-level security policy"
- Storage RLS policies are not configured. Follow step 2 above.

### "Database query error" or "Failed to create file record"
- Check that the `files` table exists and has proper RLS policies
- Verify the `folder_id` foreign key references the `products` table

### Files upload but don't appear
- Check the browser console for errors
- Click the debug button (🔍) in the top right to see file counts
- Verify the `folder_id` in the database matches the selected product ID
