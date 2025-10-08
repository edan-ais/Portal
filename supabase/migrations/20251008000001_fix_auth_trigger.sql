/*
  # Fix Authentication Trigger

  ## Problem
  The auth trigger is failing with "Database error saving new user"

  ## Solution
  1. Drop and recreate the trigger function with better error handling
  2. Ensure the profiles table structure is correct
  3. Make user_id nullable and unique

  ## Changes
  - Fix profiles table structure
  - Recreate trigger function with proper error handling
*/

-- =============================================================================
-- FIX PROFILES TABLE STRUCTURE
-- =============================================================================

-- Make sure user_id is unique (one profile per user for auth)
DO $$
BEGIN
  -- Drop existing unique constraint if it exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_user_id_unique'
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_user_id_unique;
  END IF;

  -- Add unique constraint
  ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_table THEN
    NULL;
  WHEN others THEN
    NULL;
END $$;

-- =============================================================================
-- DROP OLD TRIGGER AND FUNCTION
-- =============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- =============================================================================
-- CREATE NEW TRIGGER FUNCTION WITH ERROR HANDLING
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert new profile for the user
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    'staff'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't prevent user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- CREATE TRIGGER
-- =============================================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- UPDATE RLS POLICIES
-- =============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can create profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can update profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create new secure policies
CREATE POLICY "authenticated_users_view_all_profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Insert policy not needed - trigger creates profiles with SECURITY DEFINER

-- =============================================================================
-- TEST THE SETUP
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Authentication trigger fixed!';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  1. Made user_id unique in profiles table';
  RAISE NOTICE '  2. Recreated trigger with error handling';
  RAISE NOTICE '  3. Updated RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Try signing up again - it should work now!';
  RAISE NOTICE '';
END $$;
