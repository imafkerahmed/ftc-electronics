import React from 'react';
import { Product } from '@/types/product';

interface ProductJsonLdProps {
  product: Product;
  url: string;
}

function safeJsonLd(obj: any): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function ProductJsonLd({ product, url }: ProductJsonLdProps) {
  const activePrice = product.discountPrice || product.price;
  const inStock = product.countInStock > 0;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images,
    description: product.description,
    sku: product.id,
    brand: {
      '@type': 'Brand',
      name: product.brand,
    },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: product.currency || 'LKR',
      price: activePrice,
      priceValidUntil: '2027-12-31',
      itemCondition: 'https://schema.org/NewCondition',
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: 'FTC Electronics',
      },
    },
    ...(product.numReviews > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.numReviews,
          },
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
    />
  );
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbJsonLdProps {
  items: BreadcrumbItem[];
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
    />
  );
}

export function OrganizationJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ElectronicsStore',
    name: 'FTC Electronics',
    url: 'https://ftc-electronics.vercel.app',
    logo: 'https://ftc-electronics.vercel.app/favicon.ico',
    description: 'Premier authorized electronics retailer in Sri Lanka for laptops, smartphones, audio, and accessories.',
    telephone: '+94 77 123 4567',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Tech Avenue, Majestic City / Liberty Plaza Area',
      addressLocality: 'Colombo',
      addressCountry: 'LK',
    },
    sameAs: [
      'https://facebook.com/ftcelectronics',
      'https://instagram.com/ftcelectronics',
    ],
    priceRange: 'LKR 1,000 - LKR 1,000,000',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
    />
  );
}
