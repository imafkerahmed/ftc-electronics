/**
 * Hero Banners Seed Script
 *
 * Seeds the `hero_banners` PocketBase collection with the default hero slides
 * that were previously hardcoded in campaign-hero-banner.tsx.
 *
 * Prerequisites:
 *   - PocketBase must be accessible at NEXT_PUBLIC_POCKETBASE_URL
 *   - hero_banners collection must exist (run scripts/create-pb-schema.mjs first)
 *   - Superuser credentials set in .env.local
 *
 * Usage:
 *   node scripts/seed-hero-banners.mjs
 *
 * Idempotent: safe to re-run — skips existing records matched by titleHighlight.
 */

import PocketBase from "pocketbase";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local from project root
const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("✅ Loaded .env.local");
} else {
  dotenv.config();
  console.log("⚠️  .env.local not found, falling back to environment variables");
}

const pbUrl =
  process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://ftc-db.codix.site/";
const superuserEmail =
  process.env.POCKETBASE_SUPERUSER_EMAIL || "admin@ftc.lk";
const superuserPassword =
  process.env.POCKETBASE_SUPERUSER_PASSWORD || "Admin123";

console.log("\n🌱 Hero Banners Seed Script");
console.log("─────────────────────────────────────────");
console.log("   URL:   " + pbUrl);
console.log("   Email: " + superuserEmail);
console.log("─────────────────────────────────────────\n");

// ─── Seed Data ────────────────────────────────────────────────────────────────

const HERO_BANNERS = [
  {
    eyebrow: "Featured collection",
    titlePrefix: "Minimal design.\n",
    titleHighlight: "Serious essentials.",
    description:
      "A clean storefront hero focused on the products, with faster scanning, less noise, and a more premium feel.",
    ctaText: "Shop products",
    ctaSecondary: "Browse brands",
    link: "/products",
    secondaryLink: "/brands",
    accentColor: "#111827",
    imageSrc: "/assets/hero/Slider-Banner-Koko.png",
    imageAlt: "Featured tech essentials",
    sortOrder: 1,
    isEnabled: true,
  },
  {
    eyebrow: "Payment flexibility",
    titlePrefix: "Buy now.\n",
    titleHighlight: "Pay in 3.",
    description:
      "Split eligible purchases into three interest-free installments without adding noise to the shopping experience.",
    ctaText: "Learn about Koko Pay",
    ctaSecondary: "View all offers",
    link: "/coming-soon",
    secondaryLink: "/products?filter=on-sale",
    accentColor: "#6d28d9",
    imageSrc: "/assets/hero/Slider-Banner-Koko.png",
    imageAlt: "Koko Pay split payments",
    sortOrder: 2,
    isEnabled: true,
  },
  {
    eyebrow: "Brand spotlight",
    titlePrefix: "Designed for\n",
    titleHighlight: "IVON.",
    description:
      "A focused hero for a focused brand. Premium chargers, cables, and audio in a quiet, minimal presentation.",
    ctaText: "Shop IVON",
    ctaSecondary: "View all cables",
    link: "/products?search=IVON",
    secondaryLink: "/products",
    accentColor: "#0891b2",
    imageSrc: "/assets/hero/Slider-Banner-Ivon.png",
    imageAlt: "IVON brand products",
    sortOrder: 3,
    isEnabled: true,
  },
];

// ─── Seeder ────────────────────────────────────────────────────────────────────

async function seed() {
  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  // Authenticate
  console.log("🔑 Authenticating...");
  try {
    await pb.collection("_superusers").authWithPassword(superuserEmail, superuserPassword);
    console.log("   ✅ Authenticated as superuser\n");
  } catch {
    try {
      await pb.admins.authWithPassword(superuserEmail, superuserPassword);
      console.log("   ✅ Authenticated as admin (legacy)\n");
    } catch (err) {
      console.error("   ❌ Authentication failed:", err.message || err);
      console.log("\n   Make sure:");
      console.log("   1. PocketBase is running at", pbUrl);
      console.log("   2. Credentials are correct in .env.local");
      console.log("   3. hero_banners collection exists (run create-pb-schema.mjs first)\n");
      process.exit(1);
    }
  }

  // Check collection exists
  try {
    await pb.collections.getOne("hero_banners");
    console.log("📋 hero_banners collection found\n");
  } catch {
    console.error("❌ hero_banners collection does not exist.");
    console.log("   Run scripts/create-pb-schema.mjs first to create the schema.\n");
    process.exit(1);
  }

  console.log("🖼️  Seeding hero banners...");
  let created = 0;
  let skipped = 0;

  for (const banner of HERO_BANNERS) {
    try {
      // Check if banner with this titleHighlight already exists
      const existing = await pb
        .collection("hero_banners")
        .getFirstListItem('titleHighlight = "' + banner.titleHighlight + '"');
      skipped++;
      console.log('   ⏭️  Slide "' + banner.titleHighlight + '" already exists (id: ' + existing.id + ')');
    } catch {
      // Not found → create
      try {
        const record = await pb.collection("hero_banners").create(banner);
        created++;
        console.log('   ✅ Created slide "' + banner.titleHighlight + '" (id: ' + record.id + ')');
      } catch (err) {
        console.error('   ❌ Failed to create slide "' + banner.titleHighlight + '":', err.message || err);
        if (err.response && err.response.data) {
          console.error("      Validation details:", JSON.stringify(err.response.data, null, 2));
        }
      }
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log("🎉 Done! Created: " + created + " | Skipped: " + skipped);
  console.log("\n✨ Hero slides are now managed via the Admin Portal:");
  console.log("   → Go to /admin/homepage");
  console.log("   → Find the Hero Banner block");
  console.log("   → Click ⚙ Settings to add/edit/reorder slides\n");
}

seed().catch(console.error);
