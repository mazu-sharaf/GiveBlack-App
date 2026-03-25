import multer from "multer";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { Request } from "express";

let sharp: unknown = null;
try {
  sharp = require("sharp");
} catch {}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

function ensureUploadsDir(subdir: string) {
  const dir = path.join(UPLOADS_DIR, subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, SVG`));
    }
  },
});

function getExtension(mimetype: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return map[mimetype] || "png";
}

export interface UploadResult {
  imageUrl: string;
  thumbnailUrl: string;
  fileName: string;
}

interface SharpInstance {
  resize(w: number, h: number, opts: Record<string, unknown>): SharpInstance;
  toBuffer(): Promise<Buffer>;
}

async function processBuffers(file: Express.Multer.File) {
  let fullBuffer = file.buffer;
  let thumbBuffer = file.buffer;
  const sharpFn = sharp as ((buf: Buffer) => SharpInstance) | null;

  if (sharpFn && file.mimetype !== "image/svg+xml") {
    try {
      fullBuffer = await sharpFn(file.buffer)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .toBuffer();
    } catch {
      fullBuffer = file.buffer;
    }

    try {
      thumbBuffer = await sharpFn(file.buffer)
        .resize(200, 200, { fit: "cover" })
        .toBuffer();
    } catch {
      thumbBuffer = file.buffer;
    }
  }

  return { fullBuffer, thumbBuffer };
}

export async function uploadImage(
  file: Express.Multer.File,
  bucket: string,
  prefix: string = ""
): Promise<UploadResult> {
  const ext = getExtension(file.mimetype);
  const id = randomUUID().slice(0, 8);
  const baseName = prefix ? `${prefix}/${id}` : id;
  const fullName = `${baseName}.${ext}`;
  const thumbName = `${baseName}_thumb.${ext}`;

  const { fullBuffer, thumbBuffer } = await processBuffers(file);

  const dir = ensureUploadsDir(bucket);
  const prefixDir = path.dirname(fullName);
  if (prefixDir && prefixDir !== ".") {
    const subDir = path.join(dir, prefixDir);
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir, { recursive: true });
    }
  }

  fs.writeFileSync(path.join(dir, fullName), fullBuffer);
  fs.writeFileSync(path.join(dir, thumbName), thumbBuffer);

  return {
    imageUrl: `/uploads/${bucket}/${fullName}`,
    thumbnailUrl: `/uploads/${bucket}/${thumbName}`,
    fileName: fullName,
  };
}

export async function deleteImage(bucket: string, filePath: string): Promise<void> {
  try {
    const ext = filePath.split(".").pop() || "";
    const base = filePath.replace(`.${ext}`, "");
    const thumbPath = `${base}_thumb.${ext}`;
    const fullLocal = path.join(UPLOADS_DIR, bucket, filePath);
    const thumbLocal = path.join(UPLOADS_DIR, bucket, thumbPath);
    if (fs.existsSync(fullLocal)) fs.unlinkSync(fullLocal);
    if (fs.existsSync(thumbLocal)) fs.unlinkSync(thumbLocal);
  } catch {}
}

export function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const localMarker = `/uploads/${bucket}/`;
  const localIdx = publicUrl.indexOf(localMarker);
  if (localIdx !== -1) {
    return publicUrl.substring(localIdx + localMarker.length);
  }

  return null;
}
