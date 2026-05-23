#!/usr/bin/env node
// Convert and upscale the supplied splash background to a high-res PNG
// suitable for both iOS and Android splash screens.
//
// Run with: node scripts/build-splash-bg.mjs <input.jpg|png>

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/build-splash-bg.mjs <input>");
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

const output = resolve(repoRoot, "assets/images/splash-bg.png");

// Upscale to 1500px wide; preserves aspect ratio so portrait stays portrait.
// Lanczos3 keeps gradients/curves smooth without obvious pixelation.
await sharp(input)
  .resize({
    width: 1500,
    withoutEnlargement: false,
    kernel: "lanczos3",
  })
  .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
  .toFile(output);

const meta = await sharp(output).metadata();
console.log(`Wrote ${output} (${meta.width}x${meta.height}, PNG)`);
