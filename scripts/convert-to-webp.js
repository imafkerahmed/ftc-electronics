#!/usr/bin/env node
/**
 * convert-to-webp.js
 * Converts large PNG/JPEG hero images to WebP using the `sharp` package.
 * Originals are kept as `.orig.png` backups.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const TARGET_FILES = [
  'public/assets/hero-keyboard-nobg.png',
  'public/assets/hero-keyboard.png',
  'public/assets/hero/Slider-Banner-Koko.png',
  'public/assets/audio_bg_pattern.png',
  'public/assets/hero-laptop.png',
  'public/assets/keyboard_bg_pattern.png',
  'public/assets/hero-phone.png',
  'public/assets/hero-headphones.png',
  'public/assets/banners/anker-banner.png',
];

async function convert(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.log(`  SKIP (not found): ${filePath}`);
    return;
  }

  const dir = path.dirname(abs);
  const base = path.basename(abs, path.extname(abs));
  const webpPath = path.join(dir, `${base}.webp`);

  const statBefore = fs.statSync(abs);
  await sharp(abs)
    .webp({ quality: 82, effort: 4 })
    .toFile(webpPath);

  const statAfter = fs.statSync(webpPath);
  const saved = ((1 - statAfter.size / statBefore.size) * 100).toFixed(1);
  console.log(`  ✓ ${filePath}  ${(statBefore.size/1024).toFixed(0)}KB → ${(statAfter.size/1024).toFixed(0)}KB  (${saved}% saved)`);
}

(async () => {
  console.log('\n🖼  Converting images to WebP...\n');
  for (const f of TARGET_FILES) {
    await convert(f);
  }
  console.log('\n✅  Done! Update image src attributes to use .webp extensions.\n');
})();
