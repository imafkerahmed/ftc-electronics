/**
 * PocketBase Migration: Create the 'announcements' collection.
 *
 * Run this once via: npx tsx scripts/create-announcements-collection.ts
 */

import PocketBase from 'pocketbase';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local (Next.js convention)
config({ path: resolve(process.cwd(), '.env.local') });

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL;
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD;

if (!pbUrl || !superuserEmail || !superuserPassword) {
  console.error('❌ Missing environment variables. Ensure .env.local has:');
  console.error('   NEXT_PUBLIC_POCKETBASE_URL');
  console.error('   POCKETBASE_SUPERUSER_EMAIL');
  console.error('   POCKETBASE_SUPERUSER_PASSWORD');
  process.exit(1);
}

async function main() {
  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  // Authenticate as superuser
  await pb.collection('_superusers').authWithPassword(superuserEmail!, superuserPassword!);
  console.log('✅ Authenticated as superuser');

  // Check if collection already exists
  const collections = await pb.collections.getFullList();
  const existingCollection = collections.find((c) => c.name === 'announcements');

  const promotionFields = [
    {
      name: 'title',
      type: 'text',
      required: true,
      system: false,
      options: {},
    },
    {
      name: 'image',
      type: 'file',
      required: true,
      system: false,
      options: {
        maxSelect: 1,
        maxSize: 5242880, // 5MB
        thumbs: [],
        mimeTypes: ['image/jpg', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'],
      },
    },
    {
      name: 'link',
      type: 'text',
      required: false,
      system: false,
      options: {},
    },
    {
      name: 'isActive',
      type: 'bool',
      required: false,
      system: false,
      options: {},
    },
    {
      name: 'endsAt',
      type: 'date',
      required: false,
      system: false,
      options: {},
    },
  ];

  if (existingCollection) {
    console.log('ℹ️ Collection "announcements" already exists. Updating rules to public...');
    await pb.collections.update(existingCollection.id, {
      name: 'announcements',
      type: 'base',
      system: false,
      fields: existingCollection.fields, // keep existing fields
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    console.log('🎉 Successfully updated "announcements" collection rules!');
    return;
  }

  // Define announcements collection schema
  const announcementsCollectionSchema = {
    name: 'announcements',
    type: 'base',
    system: false,
    fields: promotionFields,
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };

  await pb.collections.create(announcementsCollectionSchema);
  console.log('🎉 Successfully created "announcements" collection!');
}

main().catch((err: any) => {
  console.error('❌ Migration failed:', err);
  if (err.response?.data) {
    console.error('🔍 Validation error details:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
