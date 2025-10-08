/*
  # Authentication Setup with Auto Profile Creation

  ## Summary
  Sets up automatic profile creation when users sign up, ensuring every
  authenticated user has a corresponding profile in the profiles table.

  ## Changes
  1. Trigger Function
     - `handle_new_user()` - Automatically creates a profile when user signs up
     - Links auth.users to profiles table via user_id
     - Sets default role to 'staff' (can be changed to 'admin' manually)

  2. Trigger
     - Fires on INSERT to auth.users table
     - Creates profile record immediately after signup

  ## Security
  - Profiles are automatically linked to authenticated users
  - Existing RLS policies control access to profiles
  - Users can view and manage their own profiles

  ## Usage
  When a user signs up with email/password:
  1. Supabase creates user in auth.users
  2. Trigger fires automatically
  3. Profile is created in profiles table
  4. User can immediately access the portal
*/

-- =============================================================================
-- AUTO PROFILE CREATION TRIGGER
-- =============================================================================

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'staff'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to run on new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- UPDATE PROFILES TABLE CONSTRAINT
-- =============================================================================

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_user_id_fkey'
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- UPDATE RLS POLICIES FOR BETTER SECURITY
-- =============================================================================

-- Drop old permissive policies
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can create profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can update profiles" ON profiles;

-- Create more secure policies
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- System will create profiles via trigger (bypasses RLS with SECURITY DEFINER)
-- So we don't need an INSERT policy for regular users

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '  ✅ AUTHENTICATION SYSTEM CONFIGURED!';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Auto Profile Creation:';
  RAISE NOTICE '   ✅ Trigger function created';
  RAISE NOTICE '   ✅ New users automatically get profiles';
  RAISE NOTICE '   ✅ Default role: staff';
  RAISE NOTICE '';
  RAISE NOTICE '🛡️  Security:';
  RAISE NOTICE '   ✅ Users can view all profiles';
  RAISE NOTICE '   ✅ Users can only update their own profile';
  RAISE NOTICE '   ✅ Foreign key constraint added';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Next steps:';
  RAISE NOTICE '   1. Users can now sign up with email/password';
  RAISE NOTICE '   2. Profile is created automatically';
  RAISE NOTICE '   3. To make a user admin, run:';
  RAISE NOTICE '      UPDATE profiles SET role = ''admin''';
  RAISE NOTICE '      WHERE user_id = ''<user-id>'';
  RAISE NOTICE '';
END $$;
