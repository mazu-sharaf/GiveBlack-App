/**
 * Load `.env` before `config/env.ts` parses `process.env`.
 * PM2/systemd may use a cwd where the default dotenv path misses the monorepo root file.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(here, "../../../.env"), // apps/api/dist/index.js → repo root
  path.resolve(here, "../../.env"), // apps/api/src/index.ts → repo root
  path.resolve(here, "../.env"), // apps/api/.env (optional)
  path.resolve(process.cwd(), ".env"),
];

let loaded = false;
for (const p of candidates) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
    loaded = true;
    break;
  }
}
if (!loaded) {
  dotenv.config();
}
