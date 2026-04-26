/**
 * Verbose auth logs: development builds, or production when EXPO_PUBLIC_DEBUG_AUTH=1.
 * Do not ship DEBUG_AUTH=1 permanently if logs are noisy.
 */
export function shouldLogAuthVerbose(): boolean {
  return (typeof __DEV__ !== "undefined" && __DEV__) || process.env.EXPO_PUBLIC_DEBUG_AUTH === "1";
}

/** Shorten OAuth client IDs for logs. */
export function maskGoogleClientId(id: string): string {
  const t = id.trim();
  if (!t) return "(empty)";
  if (t.length < 28) return `${t.slice(0, 12)}…`;
  return `${t.slice(0, 22)}…${t.slice(-18)}`;
}

export function maskJwtPrefix(token: string, keep = 16): string {
  const t = token.trim();
  if (!t) return "(empty)";
  return t.length <= keep ? `${t.slice(0, 4)}…` : `${t.slice(0, keep)}…(len ${t.length})`;
}
