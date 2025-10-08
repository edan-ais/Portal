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
console.log(`URL: ${supabaseUrl}\n`);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const REQUIRED_TABLES = [
  'products',
  'files',
  'profiles',
  'tasks',
  'notifications',
  'events',
  'leads',
  'social_posts',
  'labels',
  'donations',
  'store_products',
  'transactions'
];

async function testConnection() {
  let allPassed = true;
  const issues = [];

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  DATABASE CONNECTION TEST');
    console.log('═══════════════════════════════════════════════════════\n');

    // Test each required table
    for (const tableName of REQUIRED_TABLES) {
      process.stdout.write(`📋 Testing ${tableName.padEnd(20, ' ')}... `);

      const { data, error } = await supabase
        .from(tableName)
        .select('id')
        .limit(1);

      if (error) {
        console.log('❌ FAILED');
        console.log(`   Error: ${error.message}\n`);
        issues.push(`${tableName} table is missing or has errors`);
        allPassed = false;
      } else {
        console.log('✅ OK');
      }
    }

    // Test storage bucket
    console.log('\n🗄️  Testing storage bucket...');
    const { data: bucketFiles, error: bucketError } = await supabase.storage
      .from('labels')
      .list('', { limit: 1 });

    if (bucketError) {
      if (bucketError.message.includes('not found')) {
        console.log('❌ Bucket "labels" does NOT exist');
        issues.push('Storage bucket "labels" needs to be created');
      } else {
        console.log(`⚠️  Bucket access issue: ${bucketError.message}`);
        issues.push('Storage bucket "labels" has permission issues');
      }
      allPassed = false;
    } else {
      console.log(`✅ Bucket "labels" exists (${bucketFiles.length} items)`);
    }

    // Check products table for manual_expiry_date column
    console.log('\n📋 Checking products table schema...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, slug, days_out, manual_expiry_date')
      .limit(1);

    if (productsError) {
      console.log('❌ Products table schema issue');
      console.log(`   Error: ${productsError.message}`);
      issues.push('Products table missing manual_expiry_date column');
      allPassed = false;
    } else {
      console.log('✅ Products table schema is correct');
      if (products && products.length > 0) {
        console.log(`   Sample product: ${products[0].name}`);
      }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════');
    if (allPassed) {
      console.log('  ✅ ALL TESTS PASSED');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('🎉 Your Supabase database is properly configured!');
      console.log('   All tables exist and are accessible.');
      console.log('   Storage bucket is ready for file uploads.\n');
    } else {
      console.log('  ⚠️  ISSUES FOUND');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('The following issues were detected:\n');
      issues.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue}`);
      });
      console.log('\n📝 To fix these issues:');
      console.log('   1. Open setup-database.sql in your project root');
      console.log('   2. Go to: https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql');
      console.log('   3. Copy and paste the entire SQL script');
      console.log('   4. Click "Run" to execute the migration');
      console.log('   5. Run npm run test-db again to verify\n');
    }

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

testConnection();
