/**
 * PocketBase Seed Script
 * 
 * Run this script to populate PocketBase collections with the existing
 * mock product and category data. This is a one-time migration tool.
 * 
 * Prerequisites:
 *   1. PocketBase must be running and accessible at NEXT_PUBLIC_POCKETBASE_URL
 *   2. The following collections must be created in PocketBase admin UI:
 *      - products (with fields matching the schema in types/admin.ts)
 *      - categories (with fields matching the schema)
 *      - brands (with fields matching the schema)
 *   3. Superuser credentials must be set in .env.local
 * 
 * Usage:
 *   npx tsx src/lib/pb-seed.ts
 * 
 * Note: This script is idempotent — it checks for existing records by slug
 * before creating new ones, so it can be safely re-run.
 */

import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env vars
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site/';
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || 'admin@example.com';
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD || 'password123';

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_CATEGORIES = [
  { name: 'Laptops', slug: 'laptops', sortOrder: 1, productCount: 2 },
  { name: 'Phones', slug: 'phones', sortOrder: 2, productCount: 1 },
  { name: 'Audio', slug: 'audio', sortOrder: 3, productCount: 3 },
  { name: 'Keyboards', slug: 'keyboards', sortOrder: 4, productCount: 1 },
  { name: 'Vacuum Cleaners', slug: 'vacuum-cleaners', sortOrder: 5, productCount: 3 },
  { name: 'Air Purifiers', slug: 'air-purifiers', sortOrder: 6, productCount: 4 },
  { name: 'Power Banks', slug: 'power-banks', sortOrder: 7, productCount: 1 },
  { name: 'Accessories', slug: 'accessories', sortOrder: 8, productCount: 3 },
  { name: 'Writing Instruments', slug: 'writing-instruments', sortOrder: 9, productCount: 2 },
  { name: 'Sleeves', slug: 'sleeves', sortOrder: 10, productCount: 2 },
  { name: 'Pouches', slug: 'pouches', sortOrder: 11, productCount: 1 },
  { name: 'Personal Care', slug: 'personal-care', sortOrder: 12, productCount: 2 },
];

const SEED_BRANDS = [
  { name: 'Apex', slug: 'apex', sortOrder: 1 },
  { name: 'Phonix', slug: 'phonix', sortOrder: 2 },
  { name: 'Acoustic', slug: 'acoustic', sortOrder: 3 },
  { name: 'KeyForge', slug: 'keyforge', sortOrder: 4 },
  { name: 'VisionGlide', slug: 'visionglide', sortOrder: 5 },
  { name: 'Xiaomi', slug: 'xiaomi', sortOrder: 6 },
  { name: 'Anker', slug: 'anker', sortOrder: 7 },
  { name: 'Eufy', slug: 'eufy', sortOrder: 8 },
  { name: 'WiWU', slug: 'wiwu', sortOrder: 9 },
  { name: 'IVON', slug: 'ivon', sortOrder: 10 },
  { name: 'Dyson', slug: 'dyson', sortOrder: 11 },
];

// Product seed data with references by name (resolved to IDs after categories/brands are created)
const SEED_PRODUCTS = [
  { name: 'ApexBook Pro 16"', slug: 'apexbook-pro-16', description: 'High-performance laptop for developers, creators, and professionals.', price: 2499, discountPrice: 2299, categoryName: 'Laptops', brandName: 'Apex', specs: { CPU: 'Apex M4 Max (16-Core)', Memory: '32GB Unified RAM', Storage: '1TB PCIe NVMe SSD', Display: '16.2" Mini-LED (120Hz)', Battery: 'Up to 22 hours', Weight: '4.7 lbs (2.1 kg)' }, rating: 4.9, numReviews: 124, countInStock: 15, isFeatured: true, currency: 'USD', status: 'published' },
  { name: 'Phonix Pro 15 Ultra', slug: 'phonix-pro-15-ultra', description: 'Next-generation flagship smartphone with a revolutionary 200MP camera system.', price: 1199, categoryName: 'Phones', brandName: 'Phonix', specs: { Processor: 'Snapdragon 8 Gen 3', Screen: '6.8" AMOLED (120Hz, QHD+)', Camera: '200MP Main + 50MP Zoom + 12MP Ultra-wide' }, rating: 4.8, numReviews: 89, countInStock: 25, isFeatured: true, currency: 'USD', status: 'published' },
  { name: 'Acoustic-X ANC Headphones', slug: 'acoustic-x-anc-headphones', description: 'Premium over-ear wireless headphones with industry-leading ANC.', price: 349, discountPrice: 299, categoryName: 'Audio', brandName: 'Acoustic', specs: { Type: 'Over-Ear Wireless', Drivers: '40mm Neodymium', 'Battery Life': 'Up to 40 Hours' }, rating: 4.7, numReviews: 242, countInStock: 40, isFeatured: true, currency: 'USD', status: 'published' },
  { name: 'KeyForge Q1 Mechanical Keyboard', slug: 'keyforge-q1-mechanical-keyboard', description: 'Fully customizable, 75% layout mechanical keyboard.', price: 189, categoryName: 'Keyboards', brandName: 'KeyForge', specs: { Layout: '75% (82 keys)', Case: 'CNC Anodized Aluminum' }, rating: 4.6, numReviews: 76, countInStock: 8, currency: 'USD', status: 'published' },
  { name: 'Xiaomi Robot Vacuum H40', slug: 'xiaomi-robot-vacuum-h40', description: 'Anti-tangle vacuuming/mopping with large-capacity dust collection.', price: 184990, discountPrice: 155000, categoryName: 'Vacuum Cleaners', brandName: 'Xiaomi', specs: { Navigation: 'Laser LDS', Suction: '4000Pa' }, rating: 4.8, numReviews: 24, countInStock: 5, isPreOrder: true, currency: 'LKR', status: 'published' },
  { name: 'Anker MagGo Power Bank (10K)', slug: 'anker-maggo-power-bank-10k', description: 'Sleek magnetic power bank with MagSafe support.', price: 23500, discountPrice: 21500, categoryName: 'Power Banks', brandName: 'Anker', specs: { Capacity: '10,000 mAh' }, rating: 4.9, numReviews: 14, countInStock: 20, currency: 'LKR', status: 'published' },
  { name: 'Eufy X10 Pro Omni Robot Vacuum', slug: 'eufy-x10-pro-omni', description: 'All-in-one robotic vacuum with active mop washing.', price: 319000, discountPrice: 299990, categoryName: 'Vacuum Cleaners', brandName: 'Eufy', specs: { Suction: '8000Pa Bi-Directional' }, rating: 4.7, numReviews: 32, countInStock: 8, currency: 'LKR', status: 'published' },
  { name: 'Xiaomi Smart Air Purifier 4', slug: 'xiaomi-smart-air-purifier-6', description: 'High efficiency three-in-one filtration system.', price: 102000, categoryName: 'Air Purifiers', brandName: 'Xiaomi', specs: { Coverage: 'Up to 48 m²' }, rating: 4.8, numReviews: 42, countInStock: 8, currency: 'LKR', status: 'published' },
  { name: 'Dyson HushJet Purifier HJ10', slug: 'dyson-hushjet-purifier-hj10', description: 'Advanced desktop air purifier with HEPA H13 filtration.', price: 199990, categoryName: 'Air Purifiers', brandName: 'Dyson', specs: { Filter: 'HEPA H13' }, rating: 4.9, numReviews: 12, countInStock: 2, isPreOrder: true, currency: 'LKR', status: 'published' },
  { name: 'IVON Dual-Port Fast Charger', slug: 'ivon-dual-port-fast-charger', description: 'Dual USB outputs with intelligent power distribution.', price: 4500, discountPrice: 3890, categoryName: 'Accessories', brandName: 'IVON', specs: { Ports: 'Dual USB-A' }, rating: 4.8, numReviews: 15, countInStock: 20, currency: 'LKR', status: 'published' },
];

const SEED_REVIEWS = [
  {
    customerName: "Malith K.",
    rating: 5,
    comment: "Stunned by how fast this vacuum is! The H40 cleans my entire tiled living area and runs super silent. Sourced with official local warranty.",
    isVerified: true,
    isFeatured: true,
    status: "approved",
    productSlug: "xiaomi-robot-vacuum-h40",
  },
  {
    customerName: "Shenal R.",
    rating: 5,
    comment: "Absolute lifesaver for travel. The WiWU travel pouch easily holds all my power bricks, SSDs, and charger cables. Build quality is top-notch.",
    isVerified: true,
    isFeatured: true,
    status: "approved",
    productSlug: "apexbook-pro-16",
  },
  {
    customerName: "Kavindi P.",
    rating: 5,
    comment: "My cats shed a ton and the Xiaomi Pet Air Purifier has been a game-changer. The active carbon layer completely removes litterbox odors.",
    isVerified: true,
    isFeatured: true,
    status: "approved",
    productSlug: "xiaomi-smart-air-purifier-6",
  },
  {
    customerName: "Devinda S.",
    rating: 4,
    comment: "Charges my iPhone 15 Pro Max super fast and snaps onto the back securely without slipping. Very thin design, perfect for pocket carry.",
    isVerified: true,
    isFeatured: true,
    status: "approved",
    productSlug: "anker-maggo-power-bank-10k",
  },
  {
    customerName: "Nisansala W.",
    rating: 5,
    comment: "Best air purifier in the market. Silent sleep mode, auto sensor VOC tracking, and full Siri/Alexa app controls. Sourced via authorized channels.",
    isVerified: true,
    isFeatured: true,
    status: "approved",
    productSlug: "dyson-hushjet-purifier-hj10",
  },
];

// Helper to generate a valid PocketBase 15-character alphanumeric ID
function generatePbId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 15; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ─── Seeder Logic ─────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Starting PocketBase seed...');
  console.log(`   URL: ${pbUrl}`);

  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  // Authenticate as superuser
  try {
    await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
    console.log('✅ Authenticated as superuser');
  } catch {
    try {
      await (pb as unknown as { admins: { authWithPassword: (e: string, p: string) => Promise<unknown> } })
        .admins.authWithPassword(superuserEmail, superuserPassword);
      console.log('✅ Authenticated as admin (legacy)');
    } catch (err) {
      console.error('❌ Failed to authenticate:', err);
      console.log('\n   Make sure:');
      console.log('   1. PocketBase is running at', pbUrl);
      console.log('   2. Superuser credentials are correct in .env.local');
      process.exit(1);
    }
  }

  // ── Seed Categories ──
  console.log('\n📂 Seeding categories...');
  const categoryMap = new Map<string, string>(); // name → PB record ID

  for (const cat of SEED_CATEGORIES) {
    try {
      // Check if already exists
      const existing = await pb.collection('categories').getFirstListItem(`slug = "${cat.slug}"`);
      categoryMap.set(cat.name, existing.id);
      console.log(`   ⏭️  Category "${cat.name}" already exists (${existing.id})`);
    } catch {
      // Create new
      try {
        const record = await pb.collection('categories').create({
          id: generatePbId(),
          ...cat
        });
        categoryMap.set(cat.name, record.id);
        console.log(`   ✅ Created category "${cat.name}" (${record.id})`);
      } catch (err) {
        console.error(`   ❌ Failed to create category "${cat.name}":`, err);
      }
    }
  }

  // ── Seed Brands ──
  console.log('\n🏷️  Seeding brands...');
  const brandMap = new Map<string, string>(); // name → PB record ID

  for (const brand of SEED_BRANDS) {
    try {
      const existing = await pb.collection('brands').getFirstListItem(`slug = "${brand.slug}"`);
      brandMap.set(brand.name, existing.id);
      console.log(`   ⏭️  Brand "${brand.name}" already exists (${existing.id})`);
    } catch {
      try {
        const record = await pb.collection('brands').create({
          id: generatePbId(),
          ...brand
        });
        brandMap.set(brand.name, record.id);
        console.log(`   ✅ Created brand "${brand.name}" (${record.id})`);
      } catch (err: any) {
        console.error(`   ❌ Failed to create brand "${brand.name}":`, err.message);
        if (err.response?.data) {
          console.error(`      Validation Details:`, JSON.stringify(err.response.data));
        }
      }
    }
  }

  // ── Seed Products ──
  console.log('\n📦 Seeding products...');
  let created = 0;
  let skipped = 0;
  const productSlugToIdMap = new Map<string, string>(); // slug → PB record ID

  for (const prod of SEED_PRODUCTS) {
    try {
      const existing = await pb.collection('products').getFirstListItem(`slug = "${prod.slug}"`);
      productSlugToIdMap.set(prod.slug, existing.id);
      skipped++;
      console.log(`   ⏭️  Product "${prod.name}" already exists`);
    } catch {
      // Resolve category and brand IDs
      const categoryId = categoryMap.get(prod.categoryName);
      const brandId = brandMap.get(prod.brandName);

      if (!categoryId || !brandId) {
        console.error(`   ❌ Missing category/brand for "${prod.name}" (cat: ${prod.categoryName}, brand: ${prod.brandName})`);
        continue;
      }

      try {
        const { categoryName, brandName, ...productData } = prod;
        const newId = generatePbId();
        await pb.collection('products').create({
          id: newId,
          ...productData,
          category: categoryId,
          brand: brandId,
          specs: JSON.stringify(productData.specs),
          isFeatured: productData.isFeatured || false,
          isPreOrder: productData.isPreOrder || false,
          badges: JSON.stringify([]),
        });
        productSlugToIdMap.set(prod.slug, newId);
        created++;
        console.log(`   ✅ Created product "${prod.name}"`);
      } catch (err) {
        console.error(`   ❌ Failed to create product "${prod.name}":`, err);
      }
    }
  }

  // ── Seed Reviews ──
  console.log('\n💬 Seeding reviews...');
  let reviewsCreated = 0;
  let reviewsSkipped = 0;

  for (const rev of SEED_REVIEWS) {
    const productId = productSlugToIdMap.get(rev.productSlug);
    if (!productId) {
      console.error(`   ❌ Could not find product ID for slug "${rev.productSlug}"`);
      continue;
    }

    try {
      // Check if review already exists for this product by this customer
      const existing = await pb.collection('reviews').getFirstListItem(
        `product = "${productId}" && customerName = "${rev.customerName}"`
      );
      reviewsSkipped++;
      console.log(`   ⏭️  Review by "${rev.customerName}" for "${rev.productSlug}" already exists`);
    } catch {
      try {
        const { productSlug, ...reviewData } = rev;
        await pb.collection('reviews').create({
          id: generatePbId(),
          ...reviewData,
          product: productId,
        });
        reviewsCreated++;
        console.log(`   ✅ Created review by "${rev.customerName}" for "${rev.productSlug}"`);
      } catch (err) {
        console.error(`   ❌ Failed to create review by "${rev.customerName}":`, err);
      }
    }
  }

  console.log(`\n🎉 Seed complete! Created ${created} products, skipped ${skipped} existing.`);
  console.log(`   Reviews: Created ${reviewsCreated}, skipped ${reviewsSkipped} existing.`);
  console.log(`   Categories: ${categoryMap.size} | Brands: ${brandMap.size}`);
}

// Run if executed directly
seed().catch(console.error);
