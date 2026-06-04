import { Product, Category } from '../types/product';

// A mock products database representing FTC Electronics catalog
export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod_1',
    name: 'ApexBook Pro 16"',
    slug: 'apexbook-pro-16',
    description: 'High-performance laptop for developers, creators, and professionals. Features the latest M4 Max processor, 32GB unified memory, and 1TB ultra-fast SSD storage. The stunning 16-inch Liquid Retina XDR display makes every pixel pop.',
    price: 2499,
    discountPrice: 2299,
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600&auto=format&fit=crop'],
    category: 'Laptops',
    brand: 'Apex',
    specs: {
      CPU: 'Apex M4 Max (16-Core)',
      Memory: '32GB Unified RAM',
      Storage: '1TB PCIe NVMe SSD',
      Display: '16.2" Mini-LED (120Hz, 3456 x 2234)',
      Battery: 'Up to 22 hours',
      Weight: '4.7 lbs (2.1 kg)'
    },
    rating: 4.9,
    numReviews: 124,
    countInStock: 15,
    isFeatured: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_2',
    name: 'Phonix Pro 15 Ultra',
    slug: 'phonix-pro-15-ultra',
    description: 'Next-generation flagship smartphone with a revolutionary 200MP camera system, 5x optical zoom, and titanium alloy chassis. Driven by the Snapdragon 8 Gen 3 chipset and features a gorgeous 6.8-inch Dynamic AMOLED screen.',
    price: 1199,
    images: ['https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600&auto=format&fit=crop'],
    category: 'Phones',
    brand: 'Phonix',
    specs: {
      Processor: 'Snapdragon 8 Gen 3',
      Screen: '6.8" AMOLED (120Hz, QHD+)',
      Memory: '12GB LPDDR5X',
      Storage: '256GB UFS 4.0',
      Camera: '200MP Main + 50MP Zoom + 12MP Ultra-wide',
      Battery: '5000 mAh (45W fast charge)'
    },
    rating: 4.8,
    numReviews: 89,
    countInStock: 25,
    isFeatured: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_3',
    name: 'Acoustic-X ANC Headphones',
    slug: 'acoustic-x-anc-headphones',
    description: 'Premium over-ear wireless headphones with industry-leading Active Noise Cancellation (ANC), ambient sound transparency mode, and high-fidelity custom-engineered 40mm drivers. Enjoy 40 hours of playtime on a single charge.',
    price: 349,
    discountPrice: 299,
    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600&auto=format&fit=crop'],
    category: 'Audio',
    brand: 'Acoustic',
    specs: {
      Type: 'Over-Ear Wireless',
      Drivers: '40mm Neodymium Dynamic',
      Connectivity: 'Bluetooth 5.3 & 3.5mm Wired',
      'Battery Life': 'Up to 40 Hours (ANC On)',
      Codecs: 'LDAC, AAC, SBC',
      Weight: '250g'
    },
    rating: 4.7,
    numReviews: 242,
    countInStock: 40,
    isFeatured: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_4',
    name: 'KeyForge Q1 Mechanical Keyboard',
    slug: 'keyforge-q1-mechanical-keyboard',
    description: 'Fully customizable, 75% layout mechanical keyboard with a solid CNC aluminum body, hot-swappable switches, and double-gasket design. Fitted with pre-lubed linear switches and double-shot PBT keycaps for a deep, satisfying acoustic profile.',
    price: 189,
    images: ['https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?q=80&w=600&auto=format&fit=crop'],
    category: 'Keyboards',
    brand: 'KeyForge',
    specs: {
      Layout: '75% (82 keys)',
      Case: 'CNC Anodized Aluminum',
      Switches: 'KeyForge Linear Red (Hot-swappable)',
      Keycaps: 'Double-shot PBT Cherry Profile',
      Backlight: 'South-facing RGB',
      Connection: 'USB Type-C wired'
    },
    rating: 4.6,
    numReviews: 76,
    countInStock: 8,
    isFeatured: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod_5',
    name: 'VisionGlide 34" Curved Monitor',
    slug: 'visionglide-34-curved-monitor',
    description: 'Ultra-wide 34-inch curved monitor engineered for immersive gaming and maximum productivity. Highlights an ultrawide WQHD panel with 165Hz refresh rate, 1ms response time, and 99% sRGB color gamut coverage.',
    price: 549,
    discountPrice: 499,
    images: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=600&auto=format&fit=crop'],
    category: 'Laptops', // Categorized broadly or cataloged
    brand: 'VisionGlide',
    specs: {
      Size: '34" diagonal (1500R curvature)',
      Resolution: 'WQHD (3440 x 1440)',
      'Refresh Rate': '165Hz',
      Panel: 'VA Panel (HDR400)',
      Inputs: '2x HDMI 2.0, 2x DisplayPort 1.4, 1x USB-C (90W PD)',
      Response: '1ms MPRT'
    },
    rating: 4.5,
    numReviews: 53,
    countInStock: 12,
    isFeatured: false,
    createdAt: new Date().toISOString()
  }
];

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat_1', name: 'Laptops', slug: 'laptops', image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=300', count: 12 },
  { id: 'cat_2', name: 'Phones', slug: 'phones', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=300', count: 20 },
  { id: 'cat_3', name: 'Audio', slug: 'audio', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=300', count: 15 },
  { id: 'cat_4', name: 'Keyboards', slug: 'keyboards', image: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?q=80&w=300', count: 8 }
];

// Helper database queries
export async function getProducts(filters?: {
  category?: string;
  search?: string;
}): Promise<Product[]> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  let products = [...MOCK_PRODUCTS];

  if (filters?.category) {
    products = products.filter(
      (p) => p.category.toLowerCase() === filters.category!.toLowerCase()
    );
  }

  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower) ||
        p.brand.toLowerCase().includes(searchLower)
    );
  }

  return products;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const product = MOCK_PRODUCTS.find((p) => p.slug === slug);
  return product || null;
}

export async function getFeaturedProducts(): Promise<Product[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return MOCK_PRODUCTS.filter((p) => p.isFeatured);
}

export async function getCategories(): Promise<Category[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return MOCK_CATEGORIES;
}
