import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const adminClient = createClient(supabaseUrl, serviceRoleKey);

const tables = [
  'products',
  'categories',
  'brands',
  'homepage_blocks',
  'hero_banners',
  'reviews',
  'site_settings',
  'promotions',
  'announcements'
];

async function inspectSchema() {
  console.log('--- Inspecting Table Columns on Remote DB ---');
  for (const table of tables) {
    const { data, error } = await adminClient.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table: ${table} - Error: ${error.message}`);
    } else if (data && data.length > 0) {
      console.log(`Table: ${table} (columns: ${Object.keys(data[0]).join(', ')})`);
      console.log(`  Sample row:`, data[0]);
    } else {
      // Table exists but is empty, let's insert and rollback/delete or inspect error
      console.log(`Table: ${table} - 0 rows. Let's inspect column names via empty select:`);
      const { data: cols } = await adminClient.from(table).select('*').limit(0);
      console.log(`  Query succeeded. (Table exists)`);
    }
  }
}

inspectSchema().catch(console.error);
