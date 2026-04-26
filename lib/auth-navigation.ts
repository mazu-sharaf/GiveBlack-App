import { router } from "expo-router";
import type { Href } from "expo-router";
import { loadDonationIntent, clearDonationIntent } from "./donation-intent";

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
 * If no returnTo is provided, checks AsyncStorage for a saved donation intent and uses
 * it to restore the user to the correct donate screen (survives app restarts mid-flow).
 *
 * @param returnTo  Optional deep-link path to redirect to instead of the default tab root.
 *                  Must start with "/" to be used; only respected for donor role
 *                  (charity always goes to `/(org)`).
 */
export async function navigateAfterAuth(role: AuthAppRole, returnTo?: string): Promise<void> {
  if (role === "charity") {
    router.replace("/(org)");
    return;
  }

  const explicitDestination = resolveReturnTo(returnTo);
  if (explicitDestination) {
    // Clear any persisted intent — the explicit returnTo already encodes the
    // destination, so the intent is no longer needed.
    clearDonationIntent();
    router.replace(explicitDestination);
    return;
  }

  // No returnTo in navigation params — check for a persisted donation intent.
  const intent = await loadDonationIntent();
  if (intent) {
    await clearDonationIntent();
    const qp = new URLSearchParams();
    if (intent.campaignId) qp.set("campaignId", intent.campaignId);
    if (intent.amount != null) qp.set("amount", String(intent.amount));
    const qs = qp.toString();
    const destination = `/donate/${intent.orgId}${qs ? `?${qs}` : ""}` as Href;
    router.replace(destination);
    return;
  }

  router.replace("/(tabs)");
}
