/**
 * PocketBase Migration: Create the 'signup_otps' collection.
 *
 * Run this once via: npx tsx scripts/create-otp-collection.ts
 *
 * It uses the PocketBase collections API to create the 'signup_otps' collection
 * to store temporary sign-up payloads and OTP verification states securely.
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
  const existingCollection = collections.find((c) => c.name === 'signup_otps');

  if (existingCollection) {
    console.log('✅ Collection "signup_otps" already exists.');
    return;
  }

  // Define signup_otps collection schema
  const otpCollectionSchema = {
    name: 'signup_otps',
    type: 'base',
    system: false,
    schema: [], // PocketBase collection structure uses fields array in v0.22+
    fields: [
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
        name: 'email',
        type: 'email',
        required: true,
        system: false,
        options: {},
      },
      {
        name: 'code',
        type: 'text',
        required: true,
        system: false,
        options: {
          min: 6,
          max: 6,
          pattern: '^[0-9]{6}$',
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
        name: 'password',
        type: 'text',
        required: true,
        system: false,
        options: {},
      },
      {
        name: 'expiresAt',
        type: 'date',
        required: true,
        system: false,
        options: {},
      },
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };

  await pb.collections.create(otpCollectionSchema);
  console.log('🎉 Successfully created "signup_otps" collection!');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
