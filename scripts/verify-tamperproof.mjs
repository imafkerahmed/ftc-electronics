import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env variables
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const pbUrl = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site';
const superuserEmail = process.env.POCKETBASE_ADMIN_EMAIL || process.env.POCKETBASE_SUPERUSER_EMAIL || 'admin@ftc.lk';
const superuserPassword = process.env.POCKETBASE_ADMIN_PASSWORD || process.env.POCKETBASE_SUPERUSER_PASSWORD || 'Admin123';

function generatePbId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 15; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function run() {
  console.log('🧪 Starting Self-Contained Tamperproof Verification...');
  
  // 1. Authenticate as superuser
  const pbSuper = new PocketBase(pbUrl);
  await pbSuper.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
  console.log('🔑 Authenticated successfully as superuser.');

  // 2. Create a temporary user with admin role
  const tempUserId = generatePbId();
  const tempEmail = `temp_verify_${generatePbId()}@ftc.lk`;
  const tempPassword = 'TempPassword123';
  
  console.log(`👤 Creating temporary user (email: ${tempEmail})...`);
  const tempUser = await pbSuper.collection('users').create({
    id: tempUserId,
    email: tempEmail,
    password: tempPassword,
    passwordConfirm: tempPassword,
    name: 'Temporary Verifier',
    role: 'admin',
    verified: true
  });
  console.log(`✅ Temporary user created with ID: ${tempUser.id}`);

  // 3. Create test audit_log record
  const testId = generatePbId();
  const testRecord = await pbSuper.collection('audit_log').create({
    id: testId,
    actor: 'system_verify_test',
    action: 'verify_tamperproof_setup',
    collection: 'audit_log',
    recordId: 'test_record',
    oldValue: '',
    newValue: '',
    ip: '127.0.0.1',
    userAgent: 'test_verify_agent'
  });
  console.log(`✅ Superuser created test audit_log record: ${testRecord.id}`);

  // 4. Authenticate separate client as the temporary user
  const pbUser = new PocketBase(pbUrl);
  try {
    await pbUser.collection('users').authWithPassword(tempEmail, tempPassword);
    console.log('🔑 Authenticated successfully as temporary admin user.');
  } catch (err) {
    console.error('❌ Failed to authenticate as temporary admin user:', err.message);
    // Cleanup and exit
    await pbSuper.collection('audit_log').delete(testRecord.id);
    await pbSuper.collection('users').delete(tempUser.id);
    process.exit(1);
  }

  // 5. Attempt to UPDATE the audit_log record using the user token
  console.log('⚠️  Attempting to UPDATE (PATCH) the audit_log record...');
  try {
    await pbUser.collection('audit_log').update(testRecord.id, {
      action: 'TAMPERED_ACTION_UPDATE'
    });
    console.error('❌ FAILURE: Was able to UPDATE the audit_log record!');
  } catch (err) {
    console.log(`✅ SUCCESS: UPDATE rejected as expected. Error: ${err.message} (${err.status})`);
  }

  // 6. Attempt to DELETE the audit_log record using the user token
  console.log('⚠️  Attempting to DELETE the audit_log record...');
  try {
    await pbUser.collection('audit_log').delete(testRecord.id);
    console.error('❌ FAILURE: Was able to DELETE the audit_log record!');
  } catch (err) {
    console.log(`✅ SUCCESS: DELETE rejected as expected. Error: ${err.message} (${err.status})`);
  }

  // 7. Clean up
  await pbSuper.collection('audit_log').delete(testRecord.id);
  await pbSuper.collection('users').delete(tempUser.id);
  console.log('🧹 Cleaned up temporary test record and temporary user.');
}

run().catch((err) => {
  console.error('❌ Verification run failed:', err);
  process.exit(1);
});
