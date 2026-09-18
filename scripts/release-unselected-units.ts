import { getAdminSupabase } from '../src/lib/supabase-admin';

async function main() {
  const adminSupabase = getAdminSupabase();

  // Reset STK-CZ0CH-86291-2 and STK-CZ0CH-86453-3 back to available
  const barcodesToReset = ['STK-CZ0CH-86291-2', 'STK-CZ0CH-86453-3'];

  for (const barcode of barcodesToReset) {
    try {
      const { data: record, error } = await adminSupabase
        .from('stock_management')
        .select('id')
        .eq('barcode', barcode)
        .single();

      if (record) {
        await adminSupabase.from('stock_management').update({
          status: 'available',
          order_id: null,
          notes: 'Restored to available stock after manual serial reassignment',
        }).eq('id', record.id);
        console.log(`✅ Restored unit ${barcode} to status = available`);
      }
    } catch (err) {
      console.error(`Failed to update ${barcode}:`, err);
    }
  }
}

main().catch(console.error);
