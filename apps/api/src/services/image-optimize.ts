import sharp from "sharp";

export type OptimizeUploadOptions = {
  /** Max pixels on longest side. */
  maxSidePx?: number;
  /** JPEG quality 1-100. */
  jpegQuality?: number;
  /** Background for flattening transparency. */
  background?: { r: number; g: number; b: number };
};

export type OptimizedImage = {
  buffer: Buffer;
  ext: ".jpg";
  contentType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
};

export async function optimizeUploadImage(input: Buffer, opts: OptimizeUploadOptions = {}): Promise<OptimizedImage> {
  const maxSidePx = opts.maxSidePx ?? 1600;
  const jpegQuality = opts.jpegQuality ?? 86;
  const background = opts.background ?? { r: 255, g: 255, b: 255 };

  // rotate(): auto-orient using EXIF
  // resize(): only shrink large images; never enlarge
  // flatten(): remove alpha to encode JPEG safely (white background)
  const pipeline = sharp(input, { failOnError: false })
    .rotate()
    .resize({
      width: maxSidePx,
      height: maxSidePx,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background })
    .jpeg({ quality: jpegQuality, mozjpeg: true });

  // Run the pipeline once; then read metadata from the output to report actual dimensions.
  const buffer = await pipeline.toBuffer();
  const outMeta = await sharp(buffer).metadata();

  return {
    buffer,
    ext: ".jpg",
    contentType: "image/jpeg",
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    bytes: buffer.length,
  };
}

