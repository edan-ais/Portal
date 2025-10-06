/*
  # Update Files Table to Reference Products

  1. Changes
    - Drop existing foreign key constraint on folder_id
    - Allow folder_id to reference products table instead
    - This enables the Labels system to save file metadata to the database

  2. Notes
    - Files can now reference either folders or products depending on context
    - The column name remains folder_id for backward compatibility
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'files_folder_id_fkey'
    AND table_name = 'files'
  ) THEN
    ALTER TABLE files DROP CONSTRAINT files_folder_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'files_folder_id_fkey_products'
    AND table_name = 'files'
  ) THEN
    ALTER TABLE files
      ADD CONSTRAINT files_folder_id_fkey_products
      FOREIGN KEY (folder_id)
      REFERENCES products(id)
      ON DELETE CASCADE;
  END IF;
END $$;
