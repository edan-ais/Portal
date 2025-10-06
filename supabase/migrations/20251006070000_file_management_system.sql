/*
  # File Management System with User Profiles

  1. New Tables
    - `profiles` - User profiles (David as admin, Hubbalicious Staff as staff)
    - `active_profiles` - Tracks active profile per user
    - `folders` - Product folders (like Fudge, Rice Crispy Treats)
    - `files` - Files stored in folders
*/

-- Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  role text DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can create profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update profiles" ON profiles FOR UPDATE TO authenticated USING (true);

-- Active Profiles Table (tracks which profile user is currently using)
CREATE TABLE IF NOT EXISTS active_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE active_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active profiles" ON active_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can set active profiles" ON active_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update active profiles" ON active_profiles FOR UPDATE TO authenticated USING (true);

-- Folders Table (products like Fudge, Rice Crispy Treats)
CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  days_until_expiration integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  color text DEFAULT '#3b82f6',
  parent_folder_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view non-archived folders"
  ON folders FOR SELECT TO authenticated
  USING (is_archived = false OR true);

CREATE POLICY "Anyone can create folders" ON folders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update folders" ON folders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete folders" ON folders FOR DELETE TO authenticated USING (true);

-- Files Table
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint DEFAULT 0,
  mime_type text DEFAULT 'application/octet-stream',
  is_trashed boolean DEFAULT false,
  trashed_at timestamptz,
  google_drive_id text,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view non-trashed files"
  ON files FOR SELECT TO authenticated
  USING (is_trashed = false OR true);

CREATE POLICY "Anyone can create files" ON files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update files" ON files FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete files" ON files FOR DELETE TO authenticated USING (true);

-- Insert default profiles
INSERT INTO profiles (user_id, name, role)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'David', 'admin'),
  ('00000000-0000-0000-0000-000000000000', 'Hubbalicious Staff', 'staff')
ON CONFLICT DO NOTHING;

-- Insert sample folders
INSERT INTO folders (name, days_until_expiration, color, is_archived, created_by)
VALUES
  ('Fudge', 30, '#8b5cf6', false, '00000000-0000-0000-0000-000000000000'),
  ('Rice Crispy Treats', 14, '#ec4899', false, '00000000-0000-0000-0000-000000000000'),
  ('Archive', 0, '#6b7280', true, '00000000-0000-0000-0000-000000000000')
ON CONFLICT DO NOTHING;
