import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getAdminSupabase();

    const { data: records, error } = await supabase
      .from('products')
      .select('*, categories(*)')
      .eq('status', 'published')
      .order('name', { ascending: true });

    if (error) throw error;

    const { data: availableUnits } = await supabase
      .from('stock_management')
      .select('*')
      .eq('status', 'available');

    const unitsByProduct: Record<string, any[]> = {};
    (availableUnits || []).forEach((u: any) => {
      if (!unitsByProduct[u.product_id]) unitsByProduct[u.product_id] = [];
      unitsByProduct[u.product_id].push(u);
    });

    const products = (records || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      sku: r.slug || r.id,
      price: r.discount_price || r.price,
      wholesalePrice: r.wholesale_price || undefined,
      imageUrl: r.images?.[0] || null,
      category: r.categories?.name || '',
      countInStock: r.count_in_stock ?? 0,
      availableUnits: (unitsByProduct[r.id] || []).map((u: any) => ({
        id: u.id,
        barcode: u.barcode,
        serialNumber: u.serial_number,
      })),
    }));

    return NextResponse.json({ products });
  } catch (err: any) {
    return NextResponse.json({ products: [], error: err.message }, { status: 500 });
  }
}
