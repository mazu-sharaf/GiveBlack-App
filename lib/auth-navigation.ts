import { router } from "expo-router";
import type { Href } from "expo-router";

export type AuthAppRole = "donor" | "charity";

/**
 * Validate that a returnTo string is a safe internal app path (must start with "/").
 * Returns the value as an Expo Router Href if valid, or undefined otherwise.
 */
function resolveReturnTo(returnTo: string | undefined): Href | undefined {
  if (!returnTo) return undefined;
  if (!returnTo.startsWith("/")) return undefined;
  return returnTo as Href;
}

/**
 * After login, signup, or guest access, navigate to the main app shell.
 * Uses `router.replace` (not `dismissTo`) so `/(tabs)` / `/(org)` resolve even when
 * they were never pushed (e.g. Welcome → login only); `dismissTo` POP_TO could hit +not-found.
 *
 * @param returnTo  Optional deep-link path to redirect to instead of the default tab root.
 *                  Must start with "/" to be used; only respected for donor role
 *                  (charity always goes to `/(org)`).
 */
export function navigateAfterAuth(role: AuthAppRole, returnTo?: string): void {
  if (role === "charity") {
    router.replace("/(org)");
    return;
  }
  const destination = resolveReturnTo(returnTo);
  router.replace(destination ?? "/(tabs)");
}
