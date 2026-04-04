import { router } from "expo-router";

export type AuthAppRole = "donor" | "charity";

/**
 * After login, signup, or guest access, navigate to the main app shell.
 * Uses `router.replace` (not `dismissTo`) so `/(tabs)` / `/(org)` resolve even when
 * they were never pushed (e.g. Welcome → login only); `dismissTo` POP_TO could hit +not-found.
 */
export function navigateAfterAuth(role: AuthAppRole): void {
  const href = role === "charity" ? "/(org)" : "/(tabs)";
  router.replace(href);
}
