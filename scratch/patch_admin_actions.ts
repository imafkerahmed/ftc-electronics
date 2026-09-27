import fs from 'fs';

const path = 'src/app/actions/admin.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Update getQuotationsAction to use an explicit projection
code = code.replace(
  `let query = supabase.from('quotations').select('*', { count: 'exact' });`,
  `let query = supabase.from('quotations').select('id, quote_number, customer_name, customer_company, customer_email, customer_phone, customer_address, subtotal, tax_amount, discount_amount, discount_type, discount_value, total_amount, valid_until, status, notes, created_at, updated_at', { count: 'exact' });`
);

// 2. Add the new actions at the end of the file
const newActions = `
export async function getQuotationByIdAction(id: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const data = await pbQuotations.getById(id);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function searchQuotationProductsAction(query: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const supabase = getAdminSupabase();
    const q = query.trim();
    if (q.length < 2) return { success: true, data: [] };
    const cleanQ = q.replace(/[%_\\\\]/g, '\\\\$&');
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, price, discount_price')
      .eq('status', 'published')
      .or(\`name.ilike.%\${cleanQ}%,slug.ilike.%\${cleanQ}%\`)
      .order('name')
      .limit(20);
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function searchQuotationCustomersAction(query: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const supabase = getAdminSupabase();
    const q = query.trim();
    if (q.length < 2) return { success: true, data: [] };
    const cleanQ = q.replace(/[%_\\\\]/g, '\\\\$&');
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, email, phone')
      .or(\`name.ilike.%\${cleanQ}%,email.ilike.%\${cleanQ}%,phone.ilike.%\${cleanQ}%\`)
      .order('name')
      .limit(20);
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function searchQuotationDealersAction(query: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const supabase = getAdminSupabase();
    const q = query.trim();
    if (q.length < 2) return { success: true, data: [] };
    const cleanQ = q.replace(/[%_\\\\]/g, '\\\\$&');
    const { data, error } = await supabase
      .from('wholesale_dealers')
      .select('id, company_name, contact_name, email, phone')
      .or(\`company_name.ilike.%\${cleanQ}%,contact_name.ilike.%\${cleanQ}%,email.ilike.%\${cleanQ}%\`)
      .order('company_name')
      .limit(20);
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
`;

fs.writeFileSync(path, code + newActions);
console.log('Patched admin.ts');
