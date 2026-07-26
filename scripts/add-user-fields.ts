/**
 * PocketBase Migration: Add phone and address fields to the 'users' collection.
 *
 * Run this once via: npx tsx scripts/add-user-fields.ts
 *
 * It uses the PocketBase collections API to patch the 'users' auth collection
 * with two new text fields: 'phone' and 'address' (for billing/delivery).
 * Already-existing fields are left untouched.
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

  // Fetch the 'users' collection schema
  const collections = await pb.collections.getFullList();
  const usersCollection = collections.find((c) => c.name === 'users');

  if (!usersCollection) {
    console.error('❌ Could not find "users" collection!');
    process.exit(1);
  }

  console.log(`📋 Found "users" collection (ID: ${usersCollection.id})`);

  const existingFields: any[] = usersCollection.fields || [];
  const existingNames = new Set(existingFields.map((f: any) => f.name));

  const fieldsToAdd: any[] = [];

  if (!existingNames.has('phone')) {
    fieldsToAdd.push({
      name: 'phone',
      type: 'text',
      required: false,
      system: false,
      options: {
        min: null,
        max: 20,
        pattern: '',
      },
    });
    console.log('  ➕ Will add "phone" field');
  } else {
    console.log('  ✓ "phone" field already exists');
  }

  if (!existingNames.has('address')) {
    fieldsToAdd.push({
      name: 'address',
      type: 'text',
      required: false,
      system: false,
      options: {
        min: null,
        max: 500,
        pattern: '',
      },
    });
    console.log('  ➕ Will add "address" field');
  } else {
    console.log('  ✓ "address" field already exists');
  }

  if (fieldsToAdd.length === 0) {
    console.log('\n✅ No changes needed — all fields already exist.');
    return;
  }

  // Merge new fields with existing ones
  const updatedFields = [...existingFields, ...fieldsToAdd];

  await pb.collections.update(usersCollection.id, {
    fields: updatedFields,
  });

  console.log(`\n✅ Successfully added ${fieldsToAdd.length} field(s) to the "users" collection.`);
  console.log('   Users can now set their phone number and billing/delivery address.');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
