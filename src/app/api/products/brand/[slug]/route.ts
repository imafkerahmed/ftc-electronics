import { NextRequest, NextResponse } from 'next/server';
import { getProducts, getBrandBySlug } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

  const brand = await getBrandBySlug(slug);
  const products = brand ? await getProducts({ brand: brand.id }) : [];

  return NextResponse.json({ brand, products });
}
