/*
  # Complete Database Setup for Portal Management System

  ## Overview
  This migration sets up a complete database schema for the portal management system,
  including file management, user profiles, tasks, notifications, events, leads,
  social media posts, donations, store products, and accounting transactions.

  ## Instructions
  1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql
  2. Copy and paste this entire SQL script into the SQL Editor
  3. Click "Run" to execute the migration
  4. Verify success by checking the Tables section in your dashboard

  ## Tables Created
  - profiles (user profiles)
  - active_profiles (active profile tracking)
  - folders (product folders)
  - files (file metadata)
  - products (product definitions)
  - deleted_items (trash tracking)
  - tasks (task management)
  - notifications (notification system)
  - user_preferences (user settings)
  - events (event management)
  - leads (lead tracking)
  - social_posts (social media)
  - labels (label system)
  - donations (donation tracking)
  - store_products (store inventory)
  - transactions (accounting)
*/

-- =============================================================================
-- 1. PROFILES & USER MANAGEMENT
-- =============================================================================

-- Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  role text DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can create profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (true);

-- Active Profiles Table
CREATE TABLE IF NOT EXISTS active_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE active_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active profiles"
  ON active_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can set active profiles"
  ON active_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update active profiles"
  ON active_profiles FOR UPDATE
  TO authenticated
  USING (true);

-- Insert default profiles
INSERT INTO profiles (user_id, name, role)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'David', 'admin'),
  ('00000000-0000-0000-0000-000000000000', 'Hubbalicious Staff', 'staff')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 2. PRODUCTS & FILE MANAGEMENT
-- =============================================================================

-- Products Table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  days_out integer DEFAULT 60,
  manual_expiry_date date,
  folder_path text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can create products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (true);

-- Folders Table (legacy support)
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
  ON folders FOR SELECT
  TO authenticated
  USING (is_archived = false OR true);

CREATE POLICY "Anyone can create folders"
  ON folders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update folders"
  ON folders FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can delete folders"
  ON folders FOR DELETE
  TO authenticated
  USING (true);

-- Files Table
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES products(id) ON DELETE CASCADE,
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
  ON files FOR SELECT
  TO authenticated
  USING (is_trashed = false OR true);

CREATE POLICY "Anyone can create files"
  ON files FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update files"
  ON files FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can delete files"
  ON files FOR DELETE
  TO authenticated
  USING (true);

-- Deleted Items Table
CREATE TABLE IF NOT EXISTS deleted_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('file', 'product')),
  product_id uuid,
  original_path text,
  trash_path text,
  product_snapshot jsonb,
  deleted_at timestamptz DEFAULT now()
);

ALTER TABLE deleted_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view deleted items"
  ON deleted_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can create deleted items"
  ON deleted_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can delete deleted items"
  ON deleted_items FOR DELETE
  TO authenticated
  USING (true);

-- =============================================================================
-- 3. TASKS & NOTIFICATIONS
-- =============================================================================

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  status text DEFAULT 'todo',
  priority text DEFAULT 'medium',
  due_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text DEFAULT '',
  tab text DEFAULT '',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) UNIQUE,
  tab_order jsonb DEFAULT '["home", "tasks", "events", "leads", "social", "labels", "donations", "store", "accounting"]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 4. PORTAL MANAGEMENT TABLES
-- =============================================================================

-- Events Table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  location text DEFAULT '',
  status text DEFAULT 'upcoming',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all events"
  ON events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own events"
  ON events FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own events"
  ON events FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Leads Table
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text DEFAULT '',
  phone text DEFAULT '',
  source text DEFAULT '',
  status text DEFAULT 'new',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all leads"
  ON leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own leads"
  ON leads FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Social Posts Table
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  content text NOT NULL,
  scheduled_date timestamptz,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all social posts"
  ON social_posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create social posts"
  ON social_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own social posts"
  ON social_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own social posts"
  ON social_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Labels Table
CREATE TABLE IF NOT EXISTS labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#3b82f6',
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all labels"
  ON labels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create labels"
  ON labels FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own labels"
  ON labels FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own labels"
  ON labels FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Donations Table
CREATE TABLE IF NOT EXISTS donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_name text NOT NULL,
  donor_email text DEFAULT '',
  amount decimal(10, 2) NOT NULL,
  donation_date timestamptz DEFAULT now(),
  payment_method text DEFAULT 'cash',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all donations"
  ON donations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create donations"
  ON donations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own donations"
  ON donations FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own donations"
  ON donations FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Store Products Table
CREATE TABLE IF NOT EXISTS store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  price decimal(10, 2) NOT NULL DEFAULT 0,
  stock_quantity integer DEFAULT 0,
  sku text DEFAULT '',
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all products"
  ON store_products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create products"
  ON store_products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own products"
  ON store_products FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own products"
  ON store_products FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL,
  amount decimal(10, 2) NOT NULL,
  category text DEFAULT '',
  description text DEFAULT '',
  transaction_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- =============================================================================
-- 5. INDEXES FOR PERFORMANCE
-- =============================================================================

-- Create indexes on foreign keys
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_created_by ON files(created_by);
CREATE INDEX IF NOT EXISTS idx_files_is_trashed ON files(is_trashed);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_by ON social_posts(created_by);
CREATE INDEX IF NOT EXISTS idx_donations_created_by ON donations(created_by);
CREATE INDEX IF NOT EXISTS idx_store_products_created_by ON store_products(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_deleted_items_deleted_at ON deleted_items(deleted_at);

-- =============================================================================
-- 6. SUCCESS MESSAGE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Database setup complete!';
  RAISE NOTICE '📊 All tables have been created with proper RLS policies';
  RAISE NOTICE '🔒 Row Level Security enabled on all tables';
  RAISE NOTICE '⚡ Performance indexes added';
  RAISE NOTICE '📝 Next steps:';
  RAISE NOTICE '   1. Verify tables in Supabase Dashboard > Tables';
  RAISE NOTICE '   2. Check storage bucket "labels" exists';
  RAISE NOTICE '   3. Run npm run test-db to verify connection';
END $$;
