import { router } from "expo-router";

export type AuthAppRole = "donor" | "charity";

/**
 * After login, signup, or guest access, navigate to the main app shell.
 * Uses `router.dismissTo` so screens under the auth flow (e.g. welcome → login)
 * are removed from the stack; the OS back gesture cannot return to login.
 */
export function navigateAfterAuth(role: AuthAppRole): void {
  const href = role === "charity" ? "/(org)" : "/(tabs)";
  router.dismissTo(href);
}
