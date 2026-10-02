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

async function syncCollectionFields(name, schema, options = {}) {
  try {
    let col;
    try {
      col = await pb.collections.getOne(name);
      console.log(`⚙️  Collection "${name}" exists. Syncing fields...`);
      const existingFields = col.fields || col.schema || [];
      let updated = false;

      for (const field of schema) {
        const idx = existingFields.findIndex((f) => f.name === field.name);
        if (idx === -1) {
          existingFields.push(field);
          updated = true;
        } else {
          // Relax required constraints if needed
          if (existingFields[idx].required && !field.required) {
            existingFields[idx].required = false;
            updated = true;
          }
          if (field.type === 'select' && field.values) {
            const currentVals = existingFields[idx].values || existingFields[idx].options?.values || [];
            const missingVals = field.values.filter((v) => !currentVals.includes(v));
            if (missingVals.length > 0) {
              existingFields[idx].values = [...currentVals, ...missingVals];
              updated = true;
            }
          }
          if (field.type === 'relation' && field.collectionId) {
            if (!existingFields[idx].collectionId) {
              existingFields[idx].collectionId = field.collectionId;
              updated = true;
            }
          }
        }
      }

      if (updated) {
        if (col.fields) col.fields = existingFields;
        else col.schema = existingFields;
        col = await pb.collections.update(name, col);
        console.log(`✓ Updated schema for collection "${name}"`);
      } else {
        console.log(`✓ Schema for collection "${name}" is up to date`);
      }
      return col;
    } catch (err) {
      console.error(`  ❌ Error updating collection "${name}":`, err.response?.data ? JSON.stringify(err.response.data) : err.message || err);
    }
  } catch (err) {
    console.error(`❌ Error in syncCollectionFields for ${name}:`, err.response?.data ? JSON.stringify(err.response.data) : err.message || err);
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

  // ── users (add pin & role fields if missing) ────────────────────────────────
  try {
    const usersCol = await pb.collections.getOne('users');
    console.log(`⚙️  Syncing "users" collection schema...`);
    const fields = usersCol.fields || usersCol.schema || [];
    let modified = false;

    const hasPin = fields.some((f) => f.name === 'pin');
    if (!hasPin) {
      fields.push({ name: 'pin', type: 'text', required: false });
      modified = true;
    }

    const hasRole = fields.some((f) => f.name === 'role');
    if (!hasRole) {
      fields.push({
        name: 'role',
        type: 'select',
        required: false,
        options: { maxSelect: 1, values: ['admin', 'employee', 'manager', 'cashier'] },
      });
      modified = true;
    } else {
      const roleField = fields.find((f) => f.name === 'role');
      if (roleField && roleField.options && roleField.options.values) {
        if (!roleField.options.values.includes('cashier')) {
          roleField.options.values.push('cashier');
          modified = true;
        }
      }
    }

    if (modified) {
      if (usersCol.fields) usersCol.fields = fields;
      else usersCol.schema = fields;
      await pb.collections.update('users', usersCol);
      console.log('✓ Updated "users" collection with pin/role fields');
    } else {
      console.log('✓ "users" collection schema is up to date');
    }
  } catch (err) {
    console.warn('⚠️  Could not update users collection schema:', err.message || err);
  }

  // ── Migrate records from `employees` to `users` collection ─────────────────
  try {
    const employeesCol = await pb.collections.getOne('employees').catch(() => null);
    if (employeesCol) {
      console.log(`\n📦 Migrating employees from "employees" collection to "users"...`);
      const empList = await pb.collection('employees').getFullList();
      const userList = await pb.collection('users').getFullList();

      for (const emp of empList) {
        try {
          const existingUser = userList.find(
            (u) => (u.pin && u.pin === emp.pin) || (u.name && u.name.toLowerCase() === emp.name.toLowerCase())
          );

          if (existingUser) {
            console.log(`  Updating existing user "${existingUser.name || existingUser.email}" with PIN ${emp.pin}`);
            await pb.collection('users').update(existingUser.id, {
              pin: emp.pin || '1234',
              role: emp.role === 'cashier' ? 'employee' : emp.role || 'employee',
              name: emp.name || existingUser.name,
            });
          } else {
            const cleanName = (emp.name || 'employee').toLowerCase().replace(/[^a-z0-9]/g, '');
            const email = `${cleanName || 'emp'}_${Date.now().toString(36)}@ftc.internal`;
            const pass = (emp.pin || '12345678').padEnd(8, '0');
            console.log(`  Creating new user in "users" for employee "${emp.name}" (PIN: ${emp.pin}, Email: ${email})`);
            await pb.collection('users').create({
              username: `${cleanName}_${Date.now().toString(36)}`,
              name: emp.name,
              email,
              password: pass,
              passwordConfirm: pass,
              role: emp.role === 'cashier' ? 'employee' : emp.role || 'employee',
              pin: emp.pin,
            });
          }
        } catch (itemErr) {
          console.error(`  ❌ Failed to migrate "${emp.name}":`, itemErr.response?.data ? JSON.stringify(itemErr.response.data) : itemErr.message || itemErr);
        }
      }
      console.log('✓ Employees migration completed!');
    }
  } catch (err) {
    console.warn('⚠️  Employee migration warning:', err.response?.data ? JSON.stringify(err.response.data) : err.message || err);
  }

  // ── sales ──────────────────────────────────────────────────────────────────
  const salesCol = await syncCollectionFields('sales', [
    { name: 'receipt_number',  type: 'text',   required: false },
    { name: 'date',            type: 'text',   required: false },
    { name: 'cashier_name',    type: 'text',   required: false },
    { name: 'cashier_id',      type: 'text',   required: false },
    { name: 'customer_name',   type: 'text',   required: false },
    { name: 'customer_phone',  type: 'text',   required: false },
    { name: 'customer_email',  type: 'text',   required: false },
    { name: 'customer_id',     type: 'text',   required: false },
    { name: 'subtotal',        type: 'number', required: false },
    { name: 'discount',        type: 'number', required: false },
    { name: 'tax_amount',      type: 'number', required: false },
    { name: 'total',           type: 'number', required: false },
    { name: 'payment_method',  type: 'select', required: false, values: ['cash', 'card', 'qr', 'split'], maxSelect: 1 },
    { name: 'cash_tendered',   type: 'number', required: false },
    { name: 'change_due',      type: 'number', required: false },
    { name: 'items_count',     type: 'number', required: false },
    { name: 'status',          type: 'select', required: false, values: ['completed', 'voided', 'refunded'], maxSelect: 1 },
    { name: 'notes',           type: 'text',   required: false },
  ], {
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  });

  // ── sale_items ─────────────────────────────────────────────────────────────
  await syncCollectionFields('sale_items', [
    { name: 'sale',          type: 'relation', required: false, collectionId: salesCol?.id, maxSelect: 1, cascadeDelete: true },
    { name: 'product_id',    type: 'text',     required: false },
    { name: 'product_name',  type: 'text',     required: true },
    { name: 'sku',           type: 'text',     required: false },
    { name: 'unit_price',    type: 'number',   required: true },
    { name: 'item_discount', type: 'number',   required: false },
    { name: 'unit_cost',     type: 'number',   required: false },
    { name: 'quantity',      type: 'number',   required: true },
    { name: 'line_total',    type: 'number',   required: true },
    { name: 'unit_id',       type: 'text',     required: false },
    { name: 'unit_barcode',  type: 'text',     required: false },
    { name: 'unit_serial',   type: 'text',     required: false },
    { name: 'image_url',     type: 'text',     required: false },
    { name: 'category',      type: 'text',     required: false },
  ], {
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  });

  console.log('\n✅ POS collections setup complete!\n');
}

main().catch((err) => {
  console.error('❌ Setup failed:', err.message || err);
  process.exit(1);
});


