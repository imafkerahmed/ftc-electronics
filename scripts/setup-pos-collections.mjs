#!/usr/bin/env node
/**
 * setup-pos-collections.mjs
 * Creates the `employees`, `sales`, and `sale_items` PocketBase collections
 * needed for the FTC POS system.
 *
 * Usage: node scripts/setup-pos-collections.mjs
 */

import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config();

const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site';
const PB_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.PB_ADMIN_EMAIL || 'admin@ftc.lk';
const PB_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD || 'Admin123';

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

async function ensureCollection(name, schema, options = {}) {
  try {
    const existing = await pb.collections.getOne(name);
    console.log(`✓ Collection "${name}" already exists (id: ${existing.id})`);
    return existing;
  } catch {
    console.log(`  Creating collection "${name}"...`);
    const col = await pb.collections.create({ name, type: 'base', schema, ...options });
    console.log(`✓ Created "${name}" (id: ${col.id})`);
    return col;
  }
}

async function main() {
  console.log(`\nConnecting to PocketBase at ${PB_URL}...`);
  try {
    await pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD);
    console.log('✓ Authenticated as superuser\n');
  } catch {
    await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
    console.log('✓ Authenticated as admin\n');
  }


  // ── sales ──────────────────────────────────────────────────────────────────
  await ensureCollection('sales', [
    { name: 'cashier_name',    type: 'text',   required: false },
    { name: 'cashier_id',      type: 'text',   required: false },
    { name: 'customer_name',   type: 'text',   required: false },
    { name: 'customer_phone',  type: 'text',   required: false },
    { name: 'subtotal',        type: 'number', required: true },
    { name: 'discount',        type: 'number', required: false },
    { name: 'tax_amount',      type: 'number', required: false },
    { name: 'total',           type: 'number', required: true },
    { name: 'payment_method',  type: 'select', required: true, options: { maxSelect: 1, values: ['cash', 'card', 'qr', 'split'] } },
    { name: 'cash_tendered',   type: 'number', required: false },
    { name: 'change_due',      type: 'number', required: false },
    { name: 'status',          type: 'select', required: true, options: { maxSelect: 1, values: ['completed', 'voided'] } },
    { name: 'notes',           type: 'text',   required: false },
  ]);

  // ── sale_items ─────────────────────────────────────────────────────────────
  await ensureCollection('sale_items', [
    { name: 'sale',          type: 'relation', required: true,  options: { collectionId: '_sale_placeholder_', maxSelect: 1, cascadeDelete: true } },
    { name: 'product_id',   type: 'text',     required: false },
    { name: 'product_name', type: 'text',     required: true },
    { name: 'sku',          type: 'text',     required: false },
    { name: 'unit_price',   type: 'number',   required: true },
    { name: 'quantity',     type: 'number',   required: true },
    { name: 'line_total',   type: 'number',   required: true },
  ]);

  console.log('\n✅ POS collections setup complete!\n');
  console.log('Next step: Seed a test employee in PocketBase admin UI or via the /admin/system-config/employees page.\n');
}

main().catch((err) => {
  console.error('❌ Setup failed:', err.message || err);
  process.exit(1);
});
