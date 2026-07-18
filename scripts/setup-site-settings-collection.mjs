/**
 * Setup script: creates the `site_settings` PocketBase collection if missing,
 * and seeds default personalization and store settings.
 * Run: node scripts/setup-site-settings-collection.mjs
 */
import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site';
const email = process.env.POCKETBASE_SUPERUSER_EMAIL;
const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;

const pb = new PocketBase(pbUrl);

async function main() {
  try {
    await pb.collection('_superusers').authWithPassword(email, password);
  } catch {
    await pb.admins.authWithPassword(email, password);
  }
  console.log('Authenticated to PocketBase');

  let collection;
  try {
    collection = await pb.collections.getOne('site_settings');
    console.log('site_settings collection already exists.');
  } catch {
    collection = await pb.collections.create({
      name: 'site_settings',
      type: 'base',
      fields: [
        { name: 'key', type: 'text', required: true, unique: true },
        { name: 'value', type: 'json', required: true },
      ],
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    });
    console.log('Created site_settings collection in PocketBase');
  }

  // Seed default personalization setting if not present
  try {
    const existingPersonalization = await pb.collection('site_settings').getFirstListItem('key = "personalization"');
    console.log('Personalization site setting already present:', existingPersonalization.id);
  } catch {
    const defaultPersonalization = {
      logoUrl: '/logo.svg',
      darkLogoUrl: '/logo-dark.svg',
      faviconUrl: '/favicon.ico',
      primaryColor: '#2563eb',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
      announcement: {
        show: true,
        text: '🚀 Free islandwide delivery on orders over LKR 50,000 | Authorized Reseller',
        link: '/products',
        bgColor: '#1e293b',
      },
    };

    const created = await pb.collection('site_settings').create({
      key: 'personalization',
      value: JSON.stringify(defaultPersonalization),
    });
    console.log('Seeded default personalization site setting:', created.id);
  }
}

main().catch((e) => {
  console.error('Error setting up site_settings collection:', e.message);
  process.exit(1);
});
