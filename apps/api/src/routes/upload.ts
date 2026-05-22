import type { FastifyPluginAsync } from "fastify";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { optimizeUploadImage } from "../services/image-optimize.js";
import { isR2Configured, r2PutObject } from "../lib/storage-r2.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

/**
 * Allowed upload kinds and their R2 folder prefixes.
 *
 * Folder layout on R2 / local disk:
 *
 *   profiles/donor/       – donor avatar
 *   profiles/org/         – charity/organization logo
 *   profiles/org-cover/   – charity cover photo
 *   campaigns/cover/      – campaign main image
 *   campaigns/gallery/    – campaign gallery images (up to 5)
 *   community/post/       – community feed images
 *   categories/           – category icon images (admin)
 *   misc/                 – fallback / unclassified
 */
type KindConfig = { folder: string; maxSidePx: number; jpegQuality: number };

/**
 * Per-kind upload tuning. Smaller targets (avatars, icons) get a smaller maxSidePx
 * and slightly tighter JPEG quality so they take very little R2 space and load fast.
 * Larger banner / hero images keep more detail.
 */
const KIND_CONFIG: Record<string, KindConfig> = {
  "donor-avatar":     { folder: "profiles/donor",      maxSidePx: 512,  jpegQuality: 82 },
  "org-logo":         { folder: "profiles/org",        maxSidePx: 512,  jpegQuality: 82 },
  "category-icon":    { folder: "categories",          maxSidePx: 256,  jpegQuality: 80 },
  "org-cover":        { folder: "profiles/org-cover",  maxSidePx: 1600, jpegQuality: 84 },
  "campaign-cover":   { folder: "campaigns/cover",     maxSidePx: 1600, jpegQuality: 84 },
  "campaign-gallery": { folder: "campaigns/gallery",   maxSidePx: 1280, jpegQuality: 82 },
  "community-post":   { folder: "community/post",      maxSidePx: 1280, jpegQuality: 82 },
  "misc":             { folder: "misc",                maxSidePx: 1280, jpegQuality: 82 },
};

const DEFAULT_KIND = "misc";

function configForKind(raw: string | undefined): KindConfig {
  if (!raw) return KIND_CONFIG[DEFAULT_KIND];
  const k = raw.trim().toLowerCase();
  return KIND_CONFIG[k] ?? KIND_CONFIG[DEFAULT_KIND];
}

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  const useR2 = isR2Configured();
  if (!useR2 && !fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  app.log.info({ storage: useR2 ? "cloudflare-r2" : "local-disk" }, "upload storage initialized");

  app.post(
    "/api/upload/image",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const kind = (query.kind ?? "").trim().toLowerCase() || DEFAULT_KIND;
      const cfg = configForKind(kind);
      const folder = cfg.folder;

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: "No file uploaded" });
      }

      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
      const extLower = (path.extname(file.filename) || "").toLowerCase();
      const isOctetStream = file.mimetype === "application/octet-stream";
      const extAllowedWhenUnknown = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);
      if (!allowed.includes(file.mimetype) && !(isOctetStream && extAllowedWhenUnknown.has(extLower))) {
        return reply.code(400).send({ error: "Only JPEG, PNG, WebP, GIF, HEIC and HEIF images are allowed" });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length > 8 * 1024 * 1024) {
        return reply.code(400).send({ error: "File too large (max 8 MB)" });
      }
      let optimized: { buffer: Buffer; ext: ".jpg" };
      try {
        optimized = await optimizeUploadImage(buffer, { maxSidePx: cfg.maxSidePx, jpegQuality: cfg.jpegQuality });
      } catch (e) {
        request.log.error({ err: e }, "image optimize failed");
        return reply.code(400).send({ error: "Unsupported image format. Please upload JPEG or PNG." });
      }

      const name = `${crypto.randomUUID()}${optimized.ext}`;
      const key = `${folder}/${name}`;

      if (useR2) {
        try {
          const { url } = await r2PutObject({
            key,
            body: optimized.buffer,
            contentType: "image/jpeg",
          });
          request.log.info(
            { key, kind, folder, originalBytes: buffer.length, optimizedBytes: optimized.buffer.length },
            "uploaded to r2",
          );
          return { url, filename: name };
        } catch (e) {
          request.log.error({ err: e }, "r2 upload failed");
          return reply.code(502).send({ error: "Image upload service is temporarily unavailable." });
        }
      }

      // Fallback: local disk
      const destDir = path.join(UPLOADS_DIR, folder);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, name), optimized.buffer);
      const url = `/uploads/${key}`;
      return { url, filename: name };
    },
  );
};
