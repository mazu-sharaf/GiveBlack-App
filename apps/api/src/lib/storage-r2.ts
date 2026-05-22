import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

/**
 * Cloudflare R2 storage client (S3-compatible).
 *
 * Activated automatically when R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET, and R2_PUBLIC_URL are all set. Otherwise upload routes fall back to local disk.
 */

let cachedClient: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_URL &&
      (env.R2_ENDPOINT || env.R2_ACCOUNT_ID),
  );
}

function getEndpoint(): string {
  if (env.R2_ENDPOINT) return env.R2_ENDPOINT.replace(/\/$/, "");
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  if (!isR2Configured()) {
    throw new Error("R2 storage is not configured (missing R2_* env vars).");
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: getEndpoint(),
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return cachedClient;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType?: string;
  cacheControl?: string;
}

export interface PutObjectResult {
  key: string;
  url: string;
}

/** Upload a buffer to R2 and return its public URL. */
export async function r2PutObject(input: PutObjectInput): Promise<PutObjectResult> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET!,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType ?? "application/octet-stream",
      CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );
  return {
    key: input.key,
    url: `${env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${input.key}`,
  };
}

/** Delete an object from R2 by key. Silently succeeds when R2 is not configured. */
export async function r2DeleteObject(key: string): Promise<void> {
  if (!isR2Configured()) return;
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET!,
      Key: key,
    }),
  );
}

/** Check whether an object exists in R2. */
export async function r2ObjectExists(key: string): Promise<boolean> {
  if (!isR2Configured()) return false;
  const client = getClient();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: env.R2_BUCKET!,
        Key: key,
      }),
    );
    return true;
  } catch (e: unknown) {
    const err = e as { $metadata?: { httpStatusCode?: number } };
    if (err.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

/** Extract the object key from a public R2 URL, returning null if the URL does not match. */
export function r2KeyFromUrl(url: string): string | null {
  if (!env.R2_PUBLIC_URL) return null;
  const prefix = env.R2_PUBLIC_URL.replace(/\/$/, "") + "/";
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}
