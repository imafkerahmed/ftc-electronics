import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const sql = `
    -- Drop old overloads of admin_get_unified_sales
    DROP FUNCTION IF EXISTS public.admin_get_unified_sales(text, text, int, int);
    DROP FUNCTION IF EXISTS public.admin_get_unified_sales(text, text, text, int, int);
    DROP FUNCTION IF EXISTS public.admin_get_unified_sales(text, text, text, text, int, int);
    DROP FUNCTION IF EXISTS public.admin_get_unified_sales(text, text, text, text, text, int, int);

    -- Drop old overloads of admin_get_unified_sales_metrics
    DROP FUNCTION IF EXISTS public.admin_get_unified_sales_metrics(text, text);
    DROP FUNCTION IF EXISTS public.admin_get_unified_sales_metrics(text, text, text);
    DROP FUNCTION IF EXISTS public.admin_get_unified_sales_metrics(text, text, text, text);
  `;

  const res = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await res.json();
  console.log('Drop overloads result:', body);
}

main().catch(console.error);
