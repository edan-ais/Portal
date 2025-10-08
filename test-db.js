import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.log('Required variables:');
  console.log('  - VITE_SUPABASE_URL');
  console.log('  - VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase...');
console.log(`URL: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  try {
    console.log('\n📦 Testing products table...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, slug')
      .limit(5);

    if (productsError) {
      console.error('❌ Products table error:', productsError.message);
    } else {
      console.log(`✅ Products table accessible (${products.length} rows fetched)`);
      if (products.length > 0) {
        console.log('   Sample:', products[0]);
      }
    }

    console.log('\n📁 Testing files table...');
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('id, name, folder_id')
      .limit(5);

    if (filesError) {
      console.error('❌ Files table error:', filesError.message);
    } else {
      console.log(`✅ Files table accessible (${files.length} rows fetched)`);
    }

    console.log('\n🗄️ Testing storage bucket...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error('❌ Storage error:', bucketsError.message);
    } else {
      const labelsBucket = buckets.find(b => b.name === 'labels');
      if (labelsBucket) {
        console.log('✅ Storage bucket "labels" found');
        console.log('   Bucket details:', labelsBucket);
      } else {
        console.warn('⚠️ Storage bucket "labels" NOT FOUND');
        console.log('   Available buckets:', buckets.map(b => b.name).join(', '));
      }
    }

    console.log('\n📋 Checking products table schema...');
    const { data: schemaData, error: schemaError } = await supabase
      .from('products')
      .select('*')
      .limit(0);

    if (schemaError) {
      console.error('❌ Schema check error:', schemaError.message);
    } else {
      console.log('✅ Products table exists');
    }

    console.log('\n✅ Database connection test complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. If storage bucket "labels" is missing, create it in Supabase Dashboard');
    console.log('   2. Make sure to add the storage RLS policies (see DATABASE_SETUP.md)');
    console.log('   3. Verify manual_expiry_date column exists in products table');

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

testConnection();
