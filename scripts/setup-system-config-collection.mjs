/**
 * Setup script: creates the `system_configurations` PocketBase collection.
 * Run once:  node scripts/setup-system-config-collection.mjs
 */
import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const email = process.env.POCKETBASE_SUPERUSER_EMAIL;
const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;

const pb = new PocketBase(pbUrl);

async function main() {
  try {
    await pb.collection('_superusers').authWithPassword(email, password);
  } catch {
    await pb.admins.authWithPassword(email, password);
  }
  console.log('Authenticated');

  try {
    await pb.collections.getOne('system_configurations');
    console.log('system_configurations already exists — done.');
    process.exit(0);
  } catch { /* create it */ }

  await pb.collections.create({
    name: 'system_configurations',
    type: 'base',
    fields: [
      { name: 'category',  type: 'text', required: true },
      { name: 'label',     type: 'text', required: true },
      { name: 'config',    type: 'json', required: true },
      { name: 'isDefault', type: 'bool' },
    ],
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  });
  console.log('Created system_configurations collection');
}

main().catch(e => { console.error(e.message); process.exit(1); });
