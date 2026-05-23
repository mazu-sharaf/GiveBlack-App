#!/usr/bin/env node
// Generate the iOS app icon from an edge-to-edge source image.
// Apple requires a 1024x1024 RGB (no alpha) PNG that fills the entire
// canvas - the OS applies its own rounded-corner mask, so any internal
// padding in the source shows up as wasted white space on the home screen.
//
// Run with: node scripts/build-app-icon.mjs <input>

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/build-app-icon.mjs <input>");
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

const output = resolve(repoRoot, "assets/images/icon.png");

await sharp(input)
  .resize({
    width: 1024,
    height: 1024,
    fit: "cover",
    kernel: "lanczos3",
  })
  .flatten({ background: { r: 255, g: 255, b: 255 } })
  .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
  .toFile(output);

const meta = await sharp(output).metadata();
console.log(`Wrote ${output} (${meta.width}x${meta.height}, ${meta.channels} ch)`);
