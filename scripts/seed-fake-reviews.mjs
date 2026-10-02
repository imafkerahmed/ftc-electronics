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

async function seedFakeReviews() {
  const pb = new PocketBase(pbUrl);
  await pb.admins.authWithPassword(superuserEmail, superuserPassword);

  console.log('📦 Fetching published products...');
  const products = await pb.collection('products').getFullList();
  if (products.length === 0) {
    console.error('❌ No products found in database!');
    return;
  }

  const sampleReviews = [
    {
      customerName: 'Kavindu Perera',
      customerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      customerCity: 'Colombo 03',
      rating: 5,
      title: 'Outshines every laptop I have owned!',
      comment: 'Bought the ApexBook Pro 16 for high-resolution video editing and software builds. Deliveries took under 24 hours to Colombo. Thermals and battery life are unmatched!',
      content: 'Bought the ApexBook Pro 16 for high-resolution video editing and software builds. Deliveries took under 24 hours to Colombo. Thermals and battery life are unmatched!',
      status: 'approved',
      isVerified: true,
      isFeatured: true,
      productIndex: 0,
    },
    {
      customerName: 'Nipuni Jayawardena',
      customerAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80',
      customerCity: 'Kandy',
      rating: 5,
      title: 'Insane Active Noise Cancellation & Deep Bass',
      comment: 'Acoustic-X ANC headphones completely block out engine noise during commute. The audio staging on lossless tracks is superb. 10/10 service from FTC Electronics.',
      content: 'Acoustic-X ANC headphones completely block out engine noise during commute. The audio staging on lossless tracks is superb. 10/10 service from FTC Electronics.',
      status: 'approved',
      isVerified: true,
      isFeatured: true,
      productIndex: Math.min(1, products.length - 1),
    },
    {
      customerName: 'Ruwan Dissanayake',
      customerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      customerCity: 'Galle',
      rating: 4,
      title: 'Solid wireless mechanical keyboard for coding',
      comment: 'KeyForge Q1 tactile switches feel crisp and thocky right out of the box. Bluetooth switching between Mac and Windows laptop is seamless.',
      content: 'KeyForge Q1 tactile switches feel crisp and thocky right out of the box. Bluetooth switching between Mac and Windows laptop is seamless.',
      status: 'pending',
      isVerified: true,
      isFeatured: false,
      productIndex: Math.min(2, products.length - 1),
    },
    {
      customerName: 'Shanuka Wickramasinghe',
      customerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
      customerCity: 'Nugegoda',
      rating: 5,
      title: 'House cleaning is completely hands-free now!',
      comment: 'The Xiaomi Robot Vacuum H40 maps out multi-story layouts flawlessly. LiDAR navigation avoids cat toys effortlessly. Mintpay payment option worked smoothly.',
      content: 'The Xiaomi Robot Vacuum H40 maps out multi-story layouts flawlessly. LiDAR navigation avoids cat toys effortlessly. Mintpay payment option worked smoothly.',
      status: 'approved',
      isVerified: true,
      isFeatured: true,
      productIndex: Math.min(3, products.length - 1),
    },
    {
      customerName: 'Treshan Abeykoon',
      customerAvatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80',
      customerCity: 'Negombo',
      rating: 5,
      title: 'Spatial Audio Portable Speaker Beast!',
      comment: 'Anker Soundcore Motion X600 provides room-filling hi-res spatial audio. Perfect for beach trips and outdoor gatherings.',
      content: 'Anker Soundcore Motion X600 provides room-filling hi-res spatial audio. Perfect for beach trips and outdoor gatherings.',
      status: 'approved',
      isVerified: true,
      isFeatured: true,
      productIndex: Math.min(4, products.length - 1),
    },
    {
      customerName: 'Minoli Silva',
      customerAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      customerCity: 'Battaramulla',
      rating: 5,
      title: 'Sleek OLED Display with 14-Day Battery',
      comment: 'The Xiaomi Smart Band 8 Pro tracking metrics for swimming and running are spot on. Highly recommended store!',
      content: 'The Xiaomi Smart Band 8 Pro tracking metrics for swimming and running are spot on. Highly recommended store!',
      status: 'pending',
      isVerified: true,
      isFeatured: false,
      productIndex: Math.min(5, products.length - 1),
    },
  ];

  console.log('\n📝 Inserting sample customer reviews...');
  let count = 0;
  for (const rev of sampleReviews) {
    const targetProduct = products[rev.productIndex] || products[0];
    const existing = await pb.collection('reviews').getList(1, 1, {
      filter: `customerName = "${rev.customerName}" && title = "${rev.title}"`,
    }).catch(() => null);

    if (existing?.items?.length) {
      console.log(`   ⏭️  Review by "${rev.customerName}" already exists.`);
    } else {
      const { productIndex, ...payload } = rev;
      await pb.collection('reviews').create({
        ...payload,
        product: targetProduct.id,
      });
      count++;
      console.log(`   ✅ Created review: "${rev.title}" by ${rev.customerName} [Status: ${rev.status}]`);
    }
  }

  console.log(`\n🎉 Reviews seed completed! Added ${count} new reviews.`);
}

seedFakeReviews().catch((err) => {
  console.error('Seed error:', err);
  if (err.response?.data) {
    console.error('Validation details:', JSON.stringify(err.response.data));
  }
});
