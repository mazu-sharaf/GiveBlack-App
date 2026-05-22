#!/usr/bin/env node
/**
 * Migrate VPS-local /uploads/* files to Cloudflare R2 and rewrite DB rows.
 *
 * Strategy:
 *   1. For each table.column that may hold an image URL, find rows where the
 *      value starts with "/uploads/".
 *   2. Read the corresponding file from disk.
 *   3. Upload it to R2 under the correct folder based on which column it lives in:
 *        users.avatar_url                → profiles/donor/
 *        organizations.image_url         → profiles/org/
 *        organizations.cover_image_url   → profiles/org-cover/
 *        campaigns.main_image_url        → campaigns/cover/
 *        campaign_images.image_url       → campaigns/gallery/
 *        community_campaigns.main_image_url     → community/post/
 *        community_campaign_images.image_url    → community/post/
 *        categories.image_url            → categories/
 *        profiles.avatar_url             → profiles/donor/
 *   4. Replace the DB row with the new R2 public URL.
 *   5. After the DB is rewritten, sweep any still-local files that no row
 *      references into legacy/.
 *
 * Usage:
 *   node apps/api/scripts/migrate-local-uploads-to-r2.mjs --dry-run
 *   node apps/api/scripts/migrate-local-uploads-to-r2.mjs            # actually run
 */
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DRY = process.argv.includes("--dry-run");
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

const BUCKET = process.env.R2_BUCKET;
const ACCESS = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
const DB_URL = process.env.DATABASE_URL;

if (!BUCKET || !ACCESS || !SECRET || !PUBLIC_URL || !DB_URL) {
  console.error("Missing required env: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL, DATABASE_URL");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET },
});

/** [table, column, folder] tuples to migrate. */
const TABLES = [
  ["users",                     "avatar_url",      "profiles/donor"],
  ["profiles",                  "avatar_url",      "profiles/donor"],
  ["organizations",             "image_url",       "profiles/org"],
  ["organizations",             "cover_image_url", "profiles/org-cover"],
  ["campaigns",                 "main_image_url",  "campaigns/cover"],
  ["campaign_images",           "image_url",       "campaigns/gallery"],
  ["community_campaigns",       "main_image_url",  "community/post"],
  ["community_campaign_images", "image_url",       "community/post"],
  ["categories",                "image_url",       "categories"],
];

const MIME_BY_EXT = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".gif":  "image/gif",
};

const seenFiles = new Set(); // local paths that were touched

function r2Url(key) {
  return `${PUBLIC_URL}/${key}`;
}

async function r2Exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404) return false;
    if (e?.name === "NotFound") return false;
    throw e;
  }
}

async function uploadFile(localAbsPath, key, contentType) {
  if (DRY) return;
  const body = await fs.readFile(localAbsPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

function localPathFromUploadsUrl(url) {
  // /uploads/foo.jpg → <UPLOADS_ROOT>/foo.jpg
  const rel = url.replace(/^\/uploads\//, "");
  return path.join(UPLOADS_ROOT, rel);
}

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

console.log(`\n${DRY ? "[DRY RUN] " : ""}Migrating local /uploads/ → R2 (${BUCKET})\n`);

let migrated = 0, missing = 0, skipped = 0;

for (const [table, col, folder] of TABLES) {
  let rows;
  try {
    const r = await client.query(
      `SELECT id, ${col} AS u FROM ${table} WHERE ${col} LIKE '/uploads/%'`
    );
    rows = r.rows;
  } catch (e) {
    if (e.code === "42P01") { console.log(`  skip: table ${table} does not exist`); continue; }
    throw e;
  }
  if (rows.length === 0) continue;
  console.log(`\n${table}.${col}  (${rows.length} rows  → ${folder}/)`);

  for (const row of rows) {
    const localAbs = localPathFromUploadsUrl(row.u);
    const basename = path.basename(localAbs);
    const ext = (path.extname(basename) || ".bin").toLowerCase();
    const ct = MIME_BY_EXT[ext] || "application/octet-stream";
    const key = `${folder}/${basename}`;
    const newUrl = r2Url(key);

    let exists = false;
    try { await fs.access(localAbs); exists = true; } catch { exists = false; }
    if (!exists) {
      console.log(`  ✗ MISSING file on disk: ${row.u} (row id=${row.id}) — leaving DB unchanged`);
      missing++;
      continue;
    }
    seenFiles.add(localAbs);

    const already = await r2Exists(key);
    if (already) {
      console.log(`  ~ already on R2: ${key}  (rewriting DB)`);
    } else {
      console.log(`  ↑ ${row.u}  →  ${key}`);
      await uploadFile(localAbs, key, ct);
    }

    if (!DRY) {
      await client.query(`UPDATE ${table} SET ${col} = $1 WHERE id = $2`, [newUrl, row.id]);
    }
    migrated++;
  }
}

// ── Sweep orphan files (on disk but not referenced anywhere we migrated above)
async function walk(dir, out = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}
const allLocal = await walk(UPLOADS_ROOT);
const orphans = allLocal.filter(p => !seenFiles.has(p));

console.log(`\nOrphan files (not referenced in any migrated column): ${orphans.length}`);
for (const local of orphans) {
  const rel = path.relative(UPLOADS_ROOT, local).split(path.sep).join("/");
  const key = `legacy/${rel}`;
  const ext = (path.extname(local) || "").toLowerCase();
  const ct = MIME_BY_EXT[ext] || "application/octet-stream";
  const exists = await r2Exists(key);
  if (exists) {
    console.log(`  ~ orphan already on R2: ${key}`);
    skipped++;
    continue;
  }
  console.log(`  ↑ orphan: /uploads/${rel}  →  ${key}`);
  await uploadFile(local, key, ct);
  skipped++;
}

await client.end();

console.log(`\n${DRY ? "[DRY RUN] " : ""}Done.`);
console.log(`  DB rows rewritten:    ${migrated}`);
console.log(`  Missing local files:  ${missing}`);
console.log(`  Orphans → legacy/:    ${skipped}`);
if (DRY) console.log(`\nRe-run without --dry-run to actually upload + rewrite.`);
