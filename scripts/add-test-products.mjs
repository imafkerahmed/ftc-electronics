import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site/';
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || 'admin@example.com';
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD || 'password123';

async function seedNewTestProducts() {
  const pb = new PocketBase(pbUrl);
  await pb.admins.authWithPassword(superuserEmail, superuserPassword);

  const categories = await pb.collection('categories').getFullList();
  const brands = await pb.collection('brands').getFullList();

  console.log('Available Categories:', categories.map(c => ({ id: c.id, name: c.name })));
  console.log('Available Brands:', brands.map(b => ({ id: b.id, name: b.name })));

  const laptopsCategory = categories.find(c => c.name.toLowerCase() === 'laptops')?.id || categories[0]?.id;
  const audioCategory = categories.find(c => c.name.toLowerCase() === 'audio')?.id || categories[0]?.id;
  const accessoriesCategory = categories.find(c => c.name.toLowerCase() === 'accessories')?.id || categories[0]?.id;

  const apexBrand = brands.find(b => b.name.toLowerCase() === 'apex')?.id || brands[0]?.id;
  const ankerBrand = brands.find(b => b.name.toLowerCase() === 'anker')?.id || brands[0]?.id;
  const xiaomiBrand = brands.find(b => b.name.toLowerCase() === 'xiaomi')?.id || brands[0]?.id;

  const testProducts = [
    {
      name: 'Asus ROG Strix Scar 18 Gaming Laptop',
      slug: 'asus-rog-strix-scar-18-gaming-laptop',
      description: 'Ultra-tier 18-inch gaming laptop with Intel i9-14900HX & RTX 4090.',
      price: 1450000,
      discountPrice: 1399000,
      category: laptopsCategory,
      brand: apexBrand,
      rating: 5.0,
      numReviews: 18,
      countInStock: 2, // Low Stock / Limited Stock!
      isFeatured: true,
      currency: 'LKR',
      status: 'published',
      specs: JSON.stringify({ CPU: 'Intel Core i9 14900HX', GPU: 'RTX 4090 16GB', RAM: '64GB DDR5' }),
      badges: JSON.stringify(['LIMITED STOCK', 'HOT']),
    },
    {
      name: 'Anker Soundcore Motion X600 Speaker',
      slug: 'anker-soundcore-motion-x600-speaker',
      description: 'Spatial audio portable speaker with 50W output and high-res wireless sound.',
      price: 68500,
      discountPrice: 59900,
      category: audioCategory,
      brand: ankerBrand,
      rating: 4.9,
      numReviews: 29,
      countInStock: 12,
      isFeatured: true,
      currency: 'LKR',
      status: 'published',
      specs: JSON.stringify({ Output: '50W Spatial Audio', Battery: 'Up to 12 Hours' }),
      badges: JSON.stringify(['HIGH RES']),
    },
    {
      name: 'Xiaomi Smart Band 8 Pro Fitness Tracker',
      slug: 'xiaomi-smart-band-8-pro-fitness-tracker',
      description: '1.74" AMOLED display smartwatch with built-in GNSS GPS and 150+ sports modes.',
      price: 24500,
      discountPrice: 21900,
      category: accessoriesCategory,
      brand: xiaomiBrand,
      rating: 4.8,
      numReviews: 45,
      countInStock: 3, // Limited Stock!
      isFeatured: true,
      currency: 'LKR',
      status: 'published',
      specs: JSON.stringify({ Screen: '1.74" AMOLED', GPS: 'Multi-system GNSS' }),
      badges: JSON.stringify(['LIMITED QUANTITY']),
    },
  ];

  console.log('\n📦 Inserting sample products...');
  for (const prod of testProducts) {
    const existing = await pb.collection('products').getList(1, 1, { filter: `slug = "${prod.slug}"` }).catch(() => null);
    if (existing?.items?.length) {
      console.log(`   ⏭️  Product "${prod.name}" already exists.`);
    } else {
      await pb.collection('products').create(prod);
      console.log(`   ✅ Created product: "${prod.name}"`);
    }
  }
  console.log('🎉 Add test products complete!');
}

seedNewTestProducts().catch((err) => {
  console.error(err);
  if (err.response?.data) {
    console.error('Validation Error details:', err.response.data);
  }
});
