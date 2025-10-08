# Authentication Setup Guide

Your business portal now has a complete email/password authentication system with admin and staff roles!

## What Was Added

### 1. Authentication Components
- **Login/Signup Form** - Beautiful, modern UI for user authentication
- **Auth Context** - Global authentication state management
- **Protected Routes** - Only logged-in users can access the portal
- **User Profile Display** - Shows current user in TopBar
- **Sign Out Button** - Easy logout from user menu

### 2. Database Integration
- **Auto Profile Creation** - When users sign up, a profile is automatically created
- **Role Management** - Users have roles (admin or staff)
- **Secure Policies** - All data requires authentication

### 3. Features
- Email/password authentication
- Automatic profile creation on signup
- Role-based access (admin/staff)
- Sign out functionality
- Loading states
- Error handling
- Beautiful, responsive UI

## Setup Instructions

### Step 1: Run Database Migrations

You need to run 2 SQL scripts in your Supabase SQL Editor:

#### A. Setup Auth Trigger
1. Open: https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql
2. Copy contents of `supabase/migrations/20251008000000_setup_auth_trigger.sql`
3. Paste and click "Run"

This creates a trigger that automatically creates a profile when users sign up.

#### B. Setup Storage Permissions
1. Same SQL Editor: https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql
2. Copy contents of `fix-storage-permissions.sql`
3. Paste and click "Run"

This allows authenticated users to upload files.

### Step 2: Test the System

1. **Open your app** - You'll see the login page
2. **Click "Sign Up"** tab
3. **Create an account:**
   - Name: Your name (optional)
   - Email: your@email.com
   - Password: (at least 6 characters)
4. **Click "Create Account"**
5. **You're in!** - You should see the portal dashboard

### Step 3: Make Yourself Admin (Optional)

By default, new users are "staff". To become an admin:

1. Get your user ID from the profiles table
2. Run this SQL in Supabase:
   ```sql
   UPDATE profiles
   SET role = 'admin'
   WHERE user_id = '<your-user-id>';
   ```

Or use the email:
```sql
UPDATE profiles
SET role = 'admin'
WHERE user_id = (
  SELECT id FROM auth.users
  WHERE email = 'your@email.com'
);
```

## How It Works

### User Registration Flow
1. User fills out signup form
2. Supabase creates user in `auth.users` table
3. Database trigger automatically creates profile in `profiles` table
4. User is logged in and redirected to portal

### User Login Flow
1. User enters email and password
2. Supabase validates credentials
3. Auth context loads user profile
4. User sees portal dashboard

### User Roles

**Admin**
- Full access to all features
- Can manage all data
- Future: Can promote/demote users

**Staff**
- Standard access to portal features
- Can manage their own data
- Future: Limited permissions

## Security Features

- All routes require authentication
- RLS policies protect database tables
- Storage policies require login for file uploads
- Passwords are securely hashed by Supabase
- Sessions are managed automatically
- Sign out clears all user data

## User Experience

### Login Page
- Clean, modern design
- Toggle between login/signup
- Email and password fields
- Error messages for invalid credentials
- Loading states during authentication

### Portal
- User name and role displayed in TopBar
- Dropdown menu with profile info
- Sign out button
- All existing features work normally

## Testing Checklist

- [ ] Sign up with new account
- [ ] Verify profile was created automatically
- [ ] Log out
- [ ] Log back in with same credentials
- [ ] Try uploading a file (should work now!)
- [ ] Check user name appears in TopBar
- [ ] Test sign out
- [ ] Try accessing portal without login (should show login form)

## Troubleshooting

### Can't Upload Files
Make sure you ran the `fix-storage-permissions.sql` script. The storage bucket needs RLS policies for authenticated users.

### Profile Not Created
Make sure you ran the `setup_auth_trigger.sql` migration. This creates the trigger that auto-creates profiles.

### Can't Sign In
- Check email format is valid
- Password must be at least 6 characters
- Make sure you signed up first
- Check browser console for errors

### Email Confirmation
Email confirmation is **disabled** by default in Supabase. Users can log in immediately after signing up. If you want to enable it:

1. Go to: https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/auth/settings
2. Scroll to "Email Auth"
3. Toggle "Enable email confirmations"

## Next Steps

### Recommended Enhancements

1. **Password Reset**
   - Add "Forgot Password?" link
   - Use Supabase password reset flow

2. **Email Verification**
   - Enable email confirmations in Supabase
   - Add verification UI

3. **Admin Panel**
   - View all users
   - Change user roles
   - Manage permissions

4. **Profile Settings**
   - Edit name
   - Change password
   - Update preferences

5. **Role-Based Features**
   - Hide certain tabs based on role
   - Restrict actions by role
   - Admin-only features

## Files Modified/Created

### New Files
- `src/components/AuthForm.tsx` - Login/signup UI
- `src/contexts/AuthContext.tsx` - Auth state management
- `supabase/migrations/20251008000000_setup_auth_trigger.sql` - Auto profile creation
- `AUTH_SETUP_GUIDE.md` - This guide

### Modified Files
- `src/App.tsx` - Added auth provider and protected routes
- `src/components/TopBar.tsx` - Shows user profile and sign out
- `fix-storage-permissions.sql` - Updated for authenticated users

## Support

If you run into issues:
1. Check browser console for errors
2. Check Supabase logs
3. Verify all migrations ran successfully
4. Make sure environment variables are correct

Your business portal is now secure and ready for production!
