import { NextResponse } from 'next/server';
import { getAdminPb, getPbUrl } from '@/lib/pb-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    if (!q) {
      return NextResponse.json({ success: false, error: 'Query parameter "q" is required.' }, { status: 400 });
    }

    const adminPb = await getAdminPb();
    const pbUrl = getPbUrl();

    // 1. Check stock_management collection for barcode, serialNumber, or id
    let unit: any = null;
    try {
      unit = await adminPb.collection('stock_management').getFirstListItem(
        `barcode = "${q}" || serialNumber = "${q}" || id = "${q}"`
      );
    } catch {
      // Unit not found by exact barcode/serial/id
    }

    if (unit) {
      if (unit.status !== 'available') {
        return NextResponse.json(
          {
            success: false,
            error: `Unit ${unit.barcode || unit.serialNumber || unit.id} is ${unit.status.toUpperCase()}.`,
          },
          { status: 400 }
        );
      }

      // Fetch product details
      const p: any = await adminPb.collection('products').getOne(unit.product, { expand: 'category' });
      return NextResponse.json({
        success: true,
        type: 'unit',
        data: {
          productId: p.id,
          productName: p.name,
          sku: p.slug || p.id,
          unitPrice: p.discountPrice || p.price,
          imageUrl: p.images?.[0]
            ? `${pbUrl}/api/files/${p.collectionId}/${p.id}/${p.images[0]}?thumb=200x200`
            : null,
          countInStock: p.countInStock ?? 0,
          unitId: unit.id,
          unitBarcode: unit.barcode,
          unitSerial: unit.serialNumber,
        },
      });
    }

    // 2. Check products collection for id, slug, or name
    let productRecord: any = null;
    try {
      productRecord = await adminPb.collection('products').getFirstListItem(
        `id = "${q}" || slug = "${q}" || name ~ "${q}"`,
        { expand: 'category' }
      );
    } catch {
      // Product not found
    }

    if (productRecord) {
      if ((productRecord.countInStock ?? 0) <= 0) {
        return NextResponse.json(
          { success: false, error: `Product "${productRecord.name}" is OUT OF STOCK.` },
          { status: 400 }
        );
      }

      // Fetch an available unit if present
      let availUnit: any = null;
      try {
        availUnit = await adminPb.collection('stock_management').getFirstListItem(
          `product = "${productRecord.id}" && status = "available"`
        );
      } catch {
        // No stock_management unit found
      }

      return NextResponse.json({
        success: true,
        type: 'product',
        data: {
          productId: productRecord.id,
          productName: productRecord.name,
          sku: productRecord.slug || productRecord.id,
          unitPrice: productRecord.discountPrice || productRecord.price,
          imageUrl: productRecord.images?.[0]
            ? `${pbUrl}/api/files/${productRecord.collectionId}/${productRecord.id}/${productRecord.images[0]}?thumb=200x200`
            : null,
          countInStock: productRecord.countInStock ?? 0,
          unitId: availUnit?.id,
          unitBarcode: availUnit?.barcode,
          unitSerial: availUnit?.serialNumber,
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
