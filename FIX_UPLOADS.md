# Fix File Upload Issue - Quick Guide

## 🔴 Problem

When uploading files in the Labels tab, you see:
- "All files failed to upload"
- Console error: `new row violates row-level security policy`

## ✅ Solution (2 minutes)

The storage bucket needs permission policies. Here's how to fix it:

### Step 1: Open Supabase SQL Editor

Click this link:
👉 **https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql**

### Step 2: Run the Fix Script

1. Open the file `fix-storage-permissions.sql` in your project
2. Copy the entire contents
3. Paste into the SQL Editor
4. Click **"Run"** (or press Ctrl+Enter)

### Step 3: Test Upload

1. Go back to your app in the browser
2. Navigate to the **Labels** tab
3. Select a product (e.g., "Fudge")
4. Click **"Upload Files"** or drag & drop a PDF
5. Upload should now work! ✅

## 🔍 What the Fix Does

The script adds 4 RLS policies to the storage bucket:

| Policy | Allows |
|--------|--------|
| **INSERT** | Upload new files |
| **SELECT** | View/download files |
| **UPDATE** | Replace existing files |
| **DELETE** | Remove files |

All policies require the user to be authenticated (logged in).

## 🛡️ Security

The policies are secure because:
- ✅ Only authenticated users can upload
- ✅ Files go to the "labels" bucket only
- ✅ No public access (unless explicitly granted)
- ✅ Users can only access files in the "labels" bucket

## ❓ Still Not Working?

If uploads still fail after running the script:

1. **Check the SQL ran successfully**
   - Look for success message in SQL Editor
   - No red error messages

2. **Refresh your browser**
   - Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

3. **Check browser console**
   - Press F12 to open DevTools
   - Look at the Console tab for errors
   - If you see different errors, let me know!

4. **Verify you're logged in**
   - The app needs authentication
   - If not logged in, RLS policies won't apply

## 📋 Quick Test

After running the fix, try uploading this test file:
- Any PDF file
- Any image (PNG, JPG, etc.)
- To any product folder

Expected result: "1 file(s) uploaded successfully" ✅

## 🎯 Next Steps After Fix

Once uploads work, you can:
- Upload multiple files at once
- View uploaded files
- Preview PDFs in the browser
- Archive files
- Delete files
- Restore from trash

Everything should work perfectly!
