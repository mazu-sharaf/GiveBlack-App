import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db.js";

type CleanupResult = {
  scannedFiles: number;
  candidates: number;
  deleted: number;
  skippedReferenced: number;
  skippedTooNew: number;
  errors: number;
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);

function normalizeUploadsRef(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const idx = s.indexOf("/uploads/");
  if (idx === -1) return null;
  // Keep only the path segment starting at /uploads/
  const p = s.slice(idx);
  // Drop querystring
  const clean = p.split("?")[0];
  return clean.startsWith("/uploads/") ? clean : null;
}

async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }
  await walk(rootDir);
  return out;
}

async function fetchReferencedUploadPaths(): Promise<Set<string>> {
  // Hardcode known image URL columns that can store /uploads/... (or full URLs containing /uploads/).
  // This is intentionally conservative: better to KEEP a file than delete something in use.
  const queries: Array<{ sql: string; col: string }> = [
    { col: "users.avatar_url", sql: "select avatar_url as v from users where avatar_url is not null" },
    { col: "organizations.image_url", sql: "select image_url as v from organizations where image_url is not null" },
    { col: "organizations.cover_image_url", sql: "select cover_image_url as v from organizations where cover_image_url is not null" },
    { col: "campaigns.main_image_url", sql: "select main_image_url as v from campaigns where main_image_url is not null" },
    { col: "campaign_images.image_url", sql: "select image_url as v from campaign_images where image_url is not null" },
    { col: "categories.image_url", sql: "select image_url as v from categories where image_url is not null" },
    { col: "education_partners.image_url", sql: "select image_url as v from education_partners where image_url is not null" },
  ];

  const set = new Set<string>();
  for (const q of queries) {
    try {
      const res = await db.query(q.sql);
      for (const row of res.rows as Array<{ v?: unknown }>) {
        const ref = normalizeUploadsRef(row.v);
        if (ref) set.add(ref);
      }
    } catch {
      // Ignore missing tables/columns in edge deployments; do not fail cleanup.
    }
  }
  return set;
}

export async function cleanupOrphanUploads(opts: {
  uploadsDir: string;
  dryRun: boolean;
  maxAgeDays: number;
  logger: { info: (obj: any, msg?: string) => void; warn: (obj: any, msg?: string) => void; error: (obj: any, msg?: string) => void };
}): Promise<CleanupResult> {
  const { uploadsDir, dryRun, maxAgeDays, logger } = opts;
  const now = Date.now();
  const maxAgeMs = Math.max(1, maxAgeDays) * 24 * 60 * 60 * 1000;

  const referenced = await fetchReferencedUploadPaths();
  const files = await listFilesRecursive(uploadsDir);

  const result: CleanupResult = {
    scannedFiles: 0,
    candidates: 0,
    deleted: 0,
    skippedReferenced: 0,
    skippedTooNew: 0,
    errors: 0,
  };

  for (const full of files) {
    result.scannedFiles++;
    const ext = path.extname(full).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    let st: { mtimeMs: number };
    try {
      const s = await fs.stat(full);
      st = { mtimeMs: s.mtimeMs };
    } catch {
      result.errors++;
      continue;
    }
    const ageMs = now - st.mtimeMs;
    if (ageMs < maxAgeMs) {
      result.skippedTooNew++;
      continue;
    }

    const rel = path.relative(uploadsDir, full).split(path.sep).join("/");
    const publicPath = `/uploads/${rel}`;
    if (referenced.has(publicPath)) {
      result.skippedReferenced++;
      continue;
    }

    result.candidates++;
    if (dryRun) continue;

    try {
      await fs.unlink(full);
      result.deleted++;
    } catch (e) {
      result.errors++;
      logger.error({ err: e, file: full }, "uploads cleanup delete failed");
    }
  }

  logger.info(
    {
      dryRun,
      maxAgeDays,
      referenced: referenced.size,
      ...result,
    },
    "uploads cleanup completed"
  );

  return result;
}

