import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    if (!q) {
      return NextResponse.json({ success: false, error: 'Query parameter "q" is required.' }, { status: 400 });
    }

    const supabase = getAdminSupabase();
    const cleanQ = q.replace(/[,()"]/g, '').trim();
    if (!cleanQ) {
      return NextResponse.json({ success: false, error: 'Valid query parameter "q" is required.' }, { status: 400 });
    }

    const { data: unit } = await supabase
      .from('stock_management')
      .select('*')
      .or(`barcode.eq.${cleanQ},serial_number.eq.${cleanQ},id.eq.${cleanQ}`)
      .maybeSingle();

    if (unit) {
      if (unit.status !== 'available') {
        return NextResponse.json(
          {
            success: false,
            error: `Unit ${unit.barcode || unit.serial_number || unit.id} is ${String(unit.status ?? 'UNKNOWN').toUpperCase()}.`,
          },
          { status: 400 }
        );
      }

      const { data: p } = await supabase
        .from('products')
        .select('*')
        .eq('id', unit.product_id)
        .maybeSingle();

      if (p) {
        return NextResponse.json({
          success: true,
          type: 'unit',
          data: {
            productId: p.id,
            productName: p.name,
            sku: p.slug || p.id,
            unitPrice: p.discount_price || p.price,
            imageUrl: p.images?.[0] || null,
            countInStock: p.count_in_stock ?? 0,
            unitId: unit.id,
            unitBarcode: unit.barcode,
            unitSerial: unit.serial_number,
          },
        });
      }
    }

    const { data: productRecord } = await supabase
      .from('products')
      .select('*')
      .or(`id.eq.${cleanQ},slug.eq.${cleanQ},name.ilike.%${cleanQ}%`)
      .maybeSingle();

    if (productRecord) {
      if ((productRecord.count_in_stock ?? 0) <= 0) {
        return NextResponse.json(
          { success: false, error: `Product "${productRecord.name}" is OUT OF STOCK.` },
          { status: 400 }
        );
      }

      const { data: availUnit } = await supabase
        .from('stock_management')
        .select('*')
        .eq('product_id', productRecord.id)
        .eq('status', 'available')
        .maybeSingle();

      return NextResponse.json({
        success: true,
        type: 'product',
        data: {
          productId: productRecord.id,
          productName: productRecord.name,
          sku: productRecord.slug || productRecord.id,
          unitPrice: productRecord.discount_price || productRecord.price,
          imageUrl: productRecord.images?.[0] || null,
          countInStock: productRecord.count_in_stock ?? 0,
          unitId: availUnit?.id,
          unitBarcode: availUnit?.barcode,
          unitSerial: availUnit?.serial_number,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: `No item or unit found matching sticker barcode "${q}".` },
      { status: 404 }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Scan failed' }, { status: 500 });
  }
}
