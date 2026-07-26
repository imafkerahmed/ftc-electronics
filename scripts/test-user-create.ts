import PocketBase from 'pocketbase';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL;
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD;

async function main() {
  const pb = new PocketBase(pbUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail!, superuserPassword!);
  console.log('✅ Authenticated as superuser');

  // Let's inspect the users collection schema
  const coll = await pb.collections.getOne('users');
  console.log('📋 Users collection fields:');
  console.log(JSON.stringify(coll.fields, null, 2));

  // Let's try creating a dummy user
  try {
    const dummyUser = await pb.collection('users').create({
      email: 'dummy_verify_test@ftc-electronics.com',
      password: 'dummypassword123',
      passwordConfirm: 'dummypassword123',
      name: 'Dummy Verify Test',
      role: 'read_only',
    });
    console.log('🎉 Successfully created test user:', dummyUser.id);
    await pb.collection('users').delete(dummyUser.id);
    console.log('🗑️ Test user deleted');
  } catch (err: any) {
    console.error('❌ Failed to create user:');
    console.error('Status:', err.status);
    console.error('Data:', JSON.stringify(err.data, null, 2));
    console.error('Message:', err.message);
  }
}

main();
