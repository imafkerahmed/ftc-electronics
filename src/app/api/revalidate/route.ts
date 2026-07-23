import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get('secret');
    const expectedSecret = process.env.REVALIDATION_SECRET;

    if (!expectedSecret) {
      return NextResponse.json(
        { message: 'Revalidation secret is not configured on the server' },
        { status: 500 }
      );
    }

    if (secret !== expectedSecret) {
      return NextResponse.json({ message: 'Invalid revalidation secret' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { path, slug, category, tag } = body;

    if (path) {
      revalidatePath(path);
    }

    if (slug) {
      revalidatePath(`/products/${slug}`);
    }

    if (category) {
      revalidatePath(`/products/${category}`);
    }

    if (tag) {
      revalidateTag(tag, 'layout');
    }

    // Default: revalidate homepage and products catalog
    revalidatePath('/');
    revalidatePath('/products');

    return NextResponse.json({
      revalidated: true,
      now: Date.now(),
      message: `Successfully revalidated paths`,
    });
  } catch (err) {
    return NextResponse.json(
      { message: 'Error revalidating', error: (err as Error).message },
      { status: 500 }
    );
  }
}
