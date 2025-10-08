/*
  # Fix Storage Bucket Permissions for File Uploads

  ## Problem
  The "labels" storage bucket has RLS enabled but no policies,
  causing all uploads to fail with "new row violates row-level security policy".

  ## Solution
  Add RLS policies to allow authenticated users to:
  - Upload files (INSERT)
  - View files (SELECT)
  - Update files (UPDATE)
  - Delete files (DELETE)

  ## Instructions
  1. Go to: https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql
  2. Copy and paste this entire script
  3. Click "Run"
  4. Try uploading files again - they should work!

  ## Security
  These policies require users to be logged in (authenticated).
  Only authenticated users can upload, view, update, and delete files.
*/

-- =============================================================================
-- STORAGE BUCKET RLS POLICIES
-- =============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view files" ON storage.objects;
DROP POLICY IF EXISTS "Public can update files" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;

-- Allow authenticated users to upload files to the labels bucket
CREATE POLICY "Authenticated users can upload files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'labels');

-- Allow authenticated users to view files in the labels bucket
CREATE POLICY "Authenticated users can view files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'labels');

-- Allow authenticated users to update files in the labels bucket
CREATE POLICY "Authenticated users can update files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'labels')
WITH CHECK (bucket_id = 'labels');

-- Allow authenticated users to delete files in the labels bucket
CREATE POLICY "Authenticated users can delete files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'labels');

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '  ✅ STORAGE PERMISSIONS FIXED!';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📦 Storage bucket "labels" now allows:';
  RAISE NOTICE '   ✅ File uploads (INSERT)';
  RAISE NOTICE '   ✅ File viewing (SELECT)';
  RAISE NOTICE '   ✅ File updates (UPDATE)';
  RAISE NOTICE '   ✅ File deletion (DELETE)';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Next steps:';
  RAISE NOTICE '   1. Go to your app in the browser';
  RAISE NOTICE '   2. Navigate to the Labels tab';
  RAISE NOTICE '   3. Select a product (e.g., Fudge)';
  RAISE NOTICE '   4. Try uploading a PDF or image';
  RAISE NOTICE '   5. Upload should succeed!';
  RAISE NOTICE '';
END $$;
