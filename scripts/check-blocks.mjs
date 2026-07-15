import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site/';

async function checkHomepageBlocks() {
  const pb = new PocketBase(pbUrl);
  const blocks = await pb.collection('homepage_blocks').getFullList({ sort: 'sortOrder' });
  console.log('Homepage Blocks in PocketBase:', blocks.map(b => ({
    id: b.id,
    type: b.type,
    title: b.title,
    isEnabled: b.isEnabled,
    sortOrder: b.sortOrder,
  })));
}

checkHomepageBlocks().catch(console.error);
