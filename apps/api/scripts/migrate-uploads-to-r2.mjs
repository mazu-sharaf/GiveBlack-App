#!/usr/bin/env node
/**
 * One-time migration: copy files from apps/api/uploads/ to Cloudflare R2.
 * Idempotent — skips files that already exist in R2.
 *
 * Run from repo root:
 *   set -a && source .env && set +a && node apps/api/scripts/migrate-uploads-to-r2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

if (!accessKeyId || !secretAccessKey || !bucket || !publicUrl || (!accountId && !process.env.R2_ENDPOINT)) {
  console.error("Missing R2_* env vars. Source your .env first.");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const mimeFor = (ext) => {
  const e = ext.toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "application/octet-stream";
};

if (!fs.existsSync(UPLOADS_DIR)) {
  console.log(`No uploads directory at ${UPLOADS_DIR}; nothing to migrate.`);
  process.exit(0);
}

const files = fs.readdirSync(UPLOADS_DIR).filter((f) => !f.startsWith("."));
console.log(`Found ${files.length} file(s) in ${UPLOADS_DIR}`);

let uploaded = 0;
let skipped = 0;
let failed = 0;

for (const name of files) {
  const fullPath = path.join(UPLOADS_DIR, name);
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) continue;

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: name }));
    console.log(`skip   ${name} (already in R2)`);
    skipped += 1;
    continue;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode !== 404) {
      console.error(`head error for ${name}:`, e?.message || e);
    }
  }

  try {
    const body = fs.readFileSync(fullPath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: name,
        Body: body,
        ContentType: mimeFor(path.extname(name)),
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    console.log(`upload ${name} -> ${publicUrl}/${name}`);
    uploaded += 1;
  } catch (e) {
    console.error(`failed ${name}:`, e?.message || e);
    failed += 1;
  }
}

console.log(`\nMigration done. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
