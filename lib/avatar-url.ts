import { getApiUrl } from "@/lib/query-client";

/** Turn stored avatar paths (e.g. `/uploads/...`) into absolute URLs for Image `uri`. */
export function resolveAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getApiUrl().replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}
