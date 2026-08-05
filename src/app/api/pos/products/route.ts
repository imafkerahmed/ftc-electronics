import { NextResponse } from 'next/server';
import { getAdminPb, getPbUrl } from '@/lib/pb-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminPb = await getAdminPb();
    const pbUrl = getPbUrl();

    const [records, availableUnits] = await Promise.all([
      adminPb.collection('products').getFullList({
        filter: 'status = "published"',
        expand: 'category',
        sort: 'name',
        fields: 'id,name,slug,price,discountPrice,wholesalePrice,wholesale_price,images,category,collectionId,expand,countInStock',
      }),
      adminPb.collection('stock_management').getFullList({
        filter: 'status = "available"',
      }).catch(() => []),
    ]);

    const unitsByProduct: Record<string, any[]> = {};
    availableUnits.forEach((u: any) => {
      if (!unitsByProduct[u.product]) unitsByProduct[u.product] = [];
      unitsByProduct[u.product].push(u);
    });

    const products = records.map((r: any) => ({
      id: r.id,
      name: r.name,
      sku: r.slug || r.id,
      price: r.discountPrice || r.price,
      wholesalePrice: r.wholesalePrice || r.wholesale_price || undefined,
      imageUrl:
        r.images?.[0]
          ? `${pbUrl}/api/files/${r.collectionId}/${r.id}/${r.images[0]}?thumb=200x200`
          : null,
      category: r.expand?.category?.name || '',
      countInStock: r.countInStock ?? 0,
      availableUnits: (unitsByProduct[r.id] || []).map((u: any) => ({
        id: u.id,
        barcode: u.barcode,
        serialNumber: u.serialNumber,
      })),
    }));

    return NextResponse.json({ products });
  } catch (err: any) {
    return NextResponse.json({ products: [], error: err.message }, { status: 500 });
  }
}
