import { MetadataRoute } from 'next';
import { getProducts, getCategories, getBrands } from '@/lib/db';

const BASE_URL = 'https://ftc-electronics.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch dynamic content
  const [products, categories, brands] = await Promise.all([
    getProducts({ perPage: 1000 }),
    getCategories(),
    getBrands(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    '',
    '/products',
    '/deals',
    '/new-arrivals',
    '/about',
    '/contact',
    '/support/track-order',
    '/support/shipping-returns',
    '/support/warranty',
    '/legal/privacy',
    '/legal/terms',
  ].map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${BASE_URL}/products/${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  const brandRoutes: MetadataRoute.Sitemap = brands.map((brand) => ({
    url: `${BASE_URL}/brands/${brand.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.75,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((prod) => ({
    url: `${BASE_URL}/products/${prod.slug}`,
    lastModified: new Date(prod.createdAt || Date.now()),
    changeFrequency: 'daily',
    priority: 0.9,
  }));

  return [...staticRoutes, ...categoryRoutes, ...brandRoutes, ...productRoutes];
}
