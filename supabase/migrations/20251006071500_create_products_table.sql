/*
  # Create Products Table for Labels System

  1. New Tables
    - `products` - Product definitions for label management
      - `id` (uuid, primary key)
      - `name` (text, product display name)
      - `slug` (text, URL-friendly identifier)
      - `days_out` (integer, days until expiration)
      - `folder_path` (text, storage path for files)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `products` table
    - Add policies for authenticated users to manage products
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  days_out integer DEFAULT 60,
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
