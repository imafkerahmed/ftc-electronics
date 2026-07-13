import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/checkout/', '/account/', '/api/', '/search'],
    },
    sitemap: 'https://ftc-electronics.vercel.app/sitemap.xml',
  };
}
