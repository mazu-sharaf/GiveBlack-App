#!/usr/bin/env node
// One-off: takes the source GiveBlack circle logo and produces a 1024x1024
// transparent PNG with ~18% safe-area padding all around, suited for the
// Android 12+ Splash Screen API (288dp icon area, 192dp visible circle).
//
// Run with: node scripts/build-android-splash-logo.mjs <input.png>

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const input = process.argv[2] || resolve(repoRoot, "assets/images/splash-logo.png");
const output = resolve(repoRoot, "assets/images/splash-logo-android.png");

if (!existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

const CANVAS = 1024;
const LOGO_RATIO = 0.66;
const logoSize = Math.round(CANVAS * LOGO_RATIO);

const logo = await sharp(input)
  .resize({ width: logoSize, height: logoSize, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: CANVAS,
    height: CANVAS,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: logo, gravity: "center" }])
  .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
  .toFile(output);

console.log(`Wrote ${output} (${CANVAS}x${CANVAS}, logo at ${LOGO_RATIO * 100}% safe area)`);
