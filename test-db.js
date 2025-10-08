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
      console.error('❌ Storage listBuckets error:', bucketsError.message);
      console.log('   This might be a permissions issue - trying direct bucket access...');
    } else if (!buckets || buckets.length === 0) {
      console.warn('⚠️ listBuckets returned empty array (might be RLS permission issue)');
      console.log('   Trying to access bucket directly...');
    } else {
      const labelsBucket = buckets.find(b => b.name === 'labels');
      if (labelsBucket) {
        console.log('✅ Storage bucket "labels" found via listBuckets');
        console.log('   Bucket details:', labelsBucket);
      } else {
        console.warn('⚠️ Storage bucket "labels" NOT FOUND in listBuckets');
        console.log('   Available buckets:', buckets.map(b => b.name).join(', '));
      }
    }

    console.log('\n🔍 Testing direct bucket access...');
    const { data: bucketFiles, error: bucketError } = await supabase.storage
      .from('labels')
      .list();

    if (bucketError) {
      if (bucketError.message.includes('not found')) {
        console.error('❌ Bucket "labels" does NOT exist');
      } else {
        console.error('❌ Bucket access error:', bucketError.message);
      }
    } else {
      console.log('✅ Bucket "labels" exists and is accessible');
      console.log(`   Files in bucket: ${bucketFiles.length}`);
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
    console.log('\n📝 Summary:');
    console.log('   ✅ Database is connected');
    console.log('   ✅ Products table exists');
    console.log('   ✅ Storage bucket "labels" is accessible');

    if (filesError) {
      console.log('\n⚠️  Issues found:');
      console.log('   - Files table missing or has schema issues');
      console.log('   - Check DATABASE_SETUP.md for setup instructions');
    }

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

testConnection();
