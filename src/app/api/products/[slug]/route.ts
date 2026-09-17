import { NextRequest, NextResponse } from 'next/server';
import { getProductBySlug } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    const product = await getProductBySlug(slug);

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (err: unknown) {
    console.error('[API /api/products/[slug]] Failed:', err);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}
