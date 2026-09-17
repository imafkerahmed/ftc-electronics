import { NextRequest, NextResponse } from 'next/server';
import { sbProducts } from '@/lib/supabase-collections';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (!idsParam) {
    return NextResponse.json({ error: 'IDs parameter is required' }, { status: 400 });
  }

  // Parse, trim, and filter valid UUID / string IDs
  const rawIds = idsParam.split(',').map(id => id.trim()).filter(Boolean);
  if (rawIds.length === 0) {
    return NextResponse.json([]);
  }

  if (rawIds.length > 100) {
    return NextResponse.json({ error: 'Too many IDs. Maximum allowed is 100.' }, { status: 400 });
  }

  // Sanitize: allow only standard UUIDs or valid alphanumeric IDs (max 64 chars)
  const validIdRegex = /^[0-9a-fA-F-]{1,64}$/;
  const ids = rawIds.filter(id => validIdRegex.test(id));
  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  try {
    const products = await sbProducts.getByIds(ids);
    return NextResponse.json(products);
  } catch (error) {
    console.error('[API /api/products/batch] error:', error);
    return NextResponse.json({ error: 'Failed to fetch batch products' }, { status: 500 });
  }
}
