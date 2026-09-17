import { NextRequest, NextResponse } from 'next/server';
import { getCollectionProducts } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_COLLECTIONS = ['on-sale', 'new-arrivals', 'air-purifiers'] as const;
type Collection = typeof VALID_COLLECTIONS[number];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;

    if (!VALID_COLLECTIONS.includes(type as Collection)) {
      return NextResponse.json({ error: 'Invalid collection type' }, { status: 400 });
    }

    const products = await getCollectionProducts(type as Collection);
    return NextResponse.json(products);
  } catch (err: unknown) {
    console.error('[API /api/products/collection/[type]] Failed:', err);
    return NextResponse.json({ error: 'Failed to fetch collection products' }, { status: 500 });
  }
}
