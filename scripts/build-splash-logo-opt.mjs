// Builds compact, density-aware splash logo assets from splash-logo-source.png.
// The logo renders at ~50% of screen width, so we generate small assets:
//   @1x  200px   @2x  400px   @3x  600px
// Output PNGs are palette-compressed for fast load.

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "..", "assets", "images");
const SRC = path.join(ASSETS, "splash-logo-source.png");

const sizes = [
  { size: 200, name: "splash-logo-opt.png" },
  { size: 400, name: "splash-logo-opt@2x.png" },
  { size: 600, name: "splash-logo-opt@3x.png" },
];

for (const { size, name } of sizes) {
  const out = path.join(ASSETS, name);
  await sharp(SRC)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${name} (${size}px)`);
}
