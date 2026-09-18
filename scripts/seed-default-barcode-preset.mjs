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

  const presetConfig = {
    label: 'Default 3-up Sticker Roll',
    rollWidthMm: 96,
    labelWidthMm: 30,
    labelHeightMm: 20,
    gapMm: 2,
    gapXMm: 2,
    gapYMm: 2,
    marginMm: 1,
    columns: 3,
    barWidthMm: 0.3,
    barHeightMm: 9,
    fontSizeMm: 2.5,
    priceFontSizeMm: 3,
    showProductName: true,
    showSerial: true,
    showBatch: true,
    showPrice: true,
    isDefault: true,
  };

  // Find any existing default barcode presets to unset or update
  const existing = await pb.collection('system_configurations').getFullList({
    filter: 'category = "barcode_print"',
  });

  for (const rec of existing) {
    if (rec.isDefault) {
      await pb.collection('system_configurations').update(rec.id, { isDefault: false });
    }
  }

  // Check if a 3-up preset already exists
  const existing3up = existing.find((r) => r.label.includes('3-up') || r.label.includes('Default'));
  if (existing3up) {
    await pb.collection('system_configurations').update(existing3up.id, {
      label: presetConfig.label,
      config: JSON.stringify(presetConfig),
      isDefault: true,
    });
    console.log('Updated existing preset in PocketBase to 3-up 30x20mm roll default:', existing3up.id);
  } else {
    const created = await pb.collection('system_configurations').create({
      category: 'barcode_print',
      label: presetConfig.label,
      config: JSON.stringify(presetConfig),
      isDefault: true,
    });
    console.log('Created new preset in PocketBase:', created.id);
  }
}

main().catch((e) => {
  console.error('Error seeding preset:', e.message);
  process.exit(1);
});
