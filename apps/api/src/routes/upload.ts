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
const KIND_FOLDER: Record<string, string> = {
  "donor-avatar":      "profiles/donor",
  "org-logo":          "profiles/org",
  "org-cover":         "profiles/org-cover",
  "campaign-cover":    "campaigns/cover",
  "campaign-gallery":  "campaigns/gallery",
  "community-post":    "community/post",
  "category-icon":     "categories",
  "misc":              "misc",
};

const DEFAULT_KIND = "misc";

function folderForKind(raw: string | undefined): string {
  if (!raw) return KIND_FOLDER[DEFAULT_KIND];
  const k = raw.trim().toLowerCase();
  return KIND_FOLDER[k] ?? KIND_FOLDER[DEFAULT_KIND];
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
      const folder = folderForKind(kind);

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
        optimized = await optimizeUploadImage(buffer, { maxSidePx: 1600, jpegQuality: 86 });
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
          request.log.info({ key, kind, folder }, "uploaded to r2");
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
