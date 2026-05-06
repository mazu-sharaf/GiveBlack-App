/**
 * Handles system-level deep link paths that need remapping before Expo Router
 * resolves them to file-based routes.
 *
 * Universal-link share URLs use the short form /c/:id (served by the web
 * backend with OG tags for crawlers). The native app has no /c/[id] route,
 * so we redirect to /campaign/[id] which is the correct in-app route.
 *
 * All other valid internal paths are left unchanged so Expo Router can
 * resolve them normally (e.g. /donate/[orgId], /campaign/[id], etc.).
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  // giveblack://payment/success?session_id=...  →  /checkout-result?session_id=...
  const paymentSuccess = path.match(/^\/payment\/success(.*)/);
  if (paymentSuccess) {
    return `/checkout-result${paymentSuccess[1] ?? ""}`;
  }

  // giveblack://payment/cancel  →  /checkout-result?cancelled=1
  if (path.match(/^\/payment\/cancel/)) {
    return `/checkout-result?cancelled=1`;
  }

  // /link/checkout-result  →  /checkout-result (Stripe Checkout return, legacy Universal Link)
  const checkoutLink = path.match(/^\/link\/checkout-result(.*)/);
  if (checkoutLink) {
    return `/checkout-result${checkoutLink[1] ?? ""}`;
  }

  // /link/c/:id  →  /campaign/:id  (universal-link deep links)
  const campaignLink = path.match(/^\/link\/c\/([^/?#]+)(.*)/);
  if (campaignLink) {
    return `/campaign/${campaignLink[1]}${campaignLink[2] ?? ""}`;
  }

  // /c/:id  →  /campaign/:id  (campaign share-link short URLs)
  const campaignShort = path.match(/^\/c\/([^/?#]+)(.*)/);
  if (campaignShort) {
    return `/campaign/${campaignShort[1]}${campaignShort[2] ?? ""}`;
  }

  // Return the original path so Expo Router can handle known routes directly
  // (e.g. /donate/:orgId opened from a custom-scheme deep link).
  // Fall back to "/" only for paths that are clearly system-level or empty.
  if (path && path.startsWith("/")) {
    return path;
  }

  return "/";
}
