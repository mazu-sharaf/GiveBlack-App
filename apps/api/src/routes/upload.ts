import type { FastifyPluginAsync } from "fastify";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  app.post(
    "/api/upload/image",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: "No file uploaded" });
      }

      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(file.mimetype)) {
        return reply.code(400).send({ error: "Only JPEG, PNG, WebP and GIF images are allowed" });
      }

      const ext = path.extname(file.filename) || ".jpg";
      const name = `${crypto.randomUUID()}${ext}`;
      const dest = path.join(UPLOADS_DIR, name);

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length > 8 * 1024 * 1024) {
        return reply.code(400).send({ error: "File too large (max 8 MB)" });
      }

      fs.writeFileSync(dest, buffer);

      const url = `/uploads/${name}`;
      return { url, filename: name };
    }
  );
};
