import { NextRequest, NextResponse } from 'next/server';
import { sbProducts } from '@/lib/supabase-collections';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (!idsParam) {
    return NextResponse.json({ error: 'IDs are required' }, { status: 400 });
  }

  const ids = idsParam.split(',').map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  if (ids.length > 100) {
    return NextResponse.json({ error: 'Too many IDs. The maximum is 100.' }, { status: 400 });
  }

  try {
    const products = await sbProducts.getByIds(ids);
    return NextResponse.json(products);
  } catch (error) {
    console.error('Batch fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
