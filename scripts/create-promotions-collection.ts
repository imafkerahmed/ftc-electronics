/**
 * PocketBase Migration: Create or update the 'promotions' collection.
 *
 * Run this once via: npx tsx scripts/create-promotions-collection.ts
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
  const existingCollection = collections.find((c) => c.name === 'promotions');

  const promotionFields = [
    {
      name: 'id',
      type: 'text',
      system: true,
      required: true,
      options: {
        pattern: '^([a-z0-9]{15})$',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      system: false,
      options: {},
    },
    {
      name: 'couponCode',
      type: 'text',
      required: true,
      system: false,
      options: {},
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      system: false,
      options: {
        maxSelect: 1,
        values: ['percentage', 'flat'],
      },
    },
    {
      name: 'discountValue',
      type: 'number',
      required: true,
      system: false,
      options: {},
    },
    {
      name: 'startDate',
      type: 'date',
      required: true,
      system: false,
      options: {},
    },
    {
      name: 'endDate',
      type: 'date',
      required: true,
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
      name: 'minOrderValue',
      type: 'number',
      required: false,
      system: false,
      options: {},
    },
    {
      name: 'usageLimit',
      type: 'number',
      required: false,
      system: false,
      options: {},
    },
    {
      name: 'usageCount',
      type: 'number',
      required: false,
      system: false,
      options: {},
    },
  ];

  if (existingCollection) {
    console.log('ℹ️ Collection "promotions" already exists. Updating/migrating fields...');
    
    const mergedFields = [...existingCollection.fields] as any[];
    const fieldsToMigrate = [
      { name: 'minOrderValue', type: 'number', required: false, system: false, options: {} },
      { name: 'usageLimit', type: 'number', required: false, system: false, options: {} },
      { name: 'usageCount', type: 'number', required: false, system: false, options: {} },
    ];

    for (const field of fieldsToMigrate) {
      const hasField = mergedFields.some((f) => f.name === field.name);
      if (!hasField) {
        console.log(`   ➕ Adding missing field: ${field.name}`);
        mergedFields.push(field);
      }
    }

    await pb.collections.update(existingCollection.id, {
      name: 'promotions',
      type: 'base',
      system: false,
      fields: mergedFields,
      listRule: existingCollection.listRule || '',
      viewRule: existingCollection.viewRule || '',
      createRule: existingCollection.createRule || '',
      updateRule: existingCollection.updateRule || '',
      deleteRule: existingCollection.deleteRule || '',
    });
    console.log('🎉 Successfully updated "promotions" collection schema!');
  } else {
    console.log('Creating "promotions" collection...');
    await pb.collections.create({
      name: 'promotions',
      type: 'base',
      system: false,
      fields: promotionFields,
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    });
    console.log('🎉 Successfully created "promotions" collection!');
  }
}

main().catch((err: any) => {
  console.error('❌ Migration failed:', err);
  if (err.response?.data) {
    console.error('🔍 Validation error details:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
