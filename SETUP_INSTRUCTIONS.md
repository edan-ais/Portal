# Supabase Database Setup Instructions

## Current Status

Your Supabase database is **mostly configured** but needs one final step to complete the setup.

**✅ Working:**
- Database connection established
- Most tables exist (products, profiles, tasks, notifications, events, leads, social_posts, labels, donations, store_products, transactions)
- Storage bucket "labels" is created and accessible
- Row Level Security policies are in place

**⚠️ Missing:**
- `files` table needs to be created

## Quick Setup (2 minutes)

### Step 1: Open the SQL Editor

Go to your Supabase SQL Editor:
👉 **https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql**

### Step 2: Run the Setup Script

1. Open the file `setup-database.sql` in your project root
2. Copy the entire contents of the file
3. Paste it into the SQL Editor in your Supabase Dashboard
4. Click the **"Run"** button (or press Ctrl+Enter)
5. Wait for the success message

### Step 3: Verify Everything Works

Run the test command:

```bash
npm run test-db
```

You should see:
```
✅ ALL TESTS PASSED
🎉 Your Supabase database is properly configured!
```

## What the Setup Script Does

The script will:
- ✅ Create all missing tables (especially the `files` table)
- ✅ Set up Row Level Security (RLS) on all tables
- ✅ Create security policies for authenticated users
- ✅ Add performance indexes
- ✅ Set up proper foreign key relationships
- ✅ Add default values for all fields

## Tables Created

### Core System
- **profiles** - User profiles with admin/staff roles
- **active_profiles** - Tracks active profile per user
- **user_preferences** - User settings and tab order

### File Management
- **products** - Product definitions for labels
- **files** - File metadata with trash support ⚠️ **Missing - will be created**
- **folders** - Legacy folder support
- **deleted_items** - Trash tracking for files and products

### Task Management
- **tasks** - Task tracking with status and priority
- **notifications** - Notification system

### Portal Features
- **events** - Event management
- **leads** - Lead tracking
- **social_posts** - Social media scheduling
- **labels** - Label system
- **donations** - Donation tracking
- **store_products** - Store inventory
- **transactions** - Accounting

## Security Features

All tables have:
- ✅ Row Level Security (RLS) enabled
- ✅ Policies allowing authenticated users to view all records
- ✅ Policies allowing users to create their own records
- ✅ Policies allowing users to update their own records
- ✅ Policies allowing users to delete their own records

## Storage Configuration

The `labels` storage bucket is already configured with:
- ✅ Private access (not public)
- ✅ 50MB file size limit
- ✅ Allowed MIME types: PDF, images, text files

## Troubleshooting

### Issue: "Could not find the table 'public.files'"
**Solution:** Run the setup-database.sql script as described above.

### Issue: "RLS policy violation"
**Solution:** The setup script will create all necessary RLS policies automatically.

### Issue: "Storage bucket not found"
**Solution:** The bucket already exists! This is just a permission message you can ignore.

### Issue: Can't connect to database
**Solution:** Check your `.env` file has valid credentials:
```
VITE_SUPABASE_URL=https://hxpbjtimdctvhxqulnce.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Next Steps

After setup is complete:

1. ✅ Run `npm run test-db` to verify everything works
2. ✅ Start the development server with `npm run dev` (if not already running)
3. ✅ Test the Labels tab - upload some files
4. ✅ Test other tabs to ensure they work with the database

## Support

If you encounter any issues:
1. Check the test output: `npm run test-db`
2. Review the Supabase dashboard for error messages
3. Check the browser console for client-side errors
4. Verify your `.env` file has correct credentials

Your Supabase project URL: https://hxpbjtimdctvhxqulnce.supabase.co
