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
 * Pop the root stack to its first route, then replace with the given href.
 * Without this, a flow like `(tabs)` → push `donor-login` → `replace(tabs)` can leave
 * `donor-login` under `(tabs)` in history, so the iOS back gesture returns to the login screen.
 */
export function resetNavigationStackThenReplace(href: Href): void {
  // `dismissAll()` dispatches POP_TO_TOP under the hood. In Expo Go / certain navigator
  // states this is *not handled* and causes a dev-only warning. To keep dev clean, avoid
  // calling dismissAll and rely on replace (acceptable in production too).
  router.replace(href);
}

/**
 * After login, signup, or guest access, navigate to the main app shell.
 * Uses `dismissAll` + `replace` so auth screens are not left under the main shell in the stack
 * (fixes swipe-back landing on login after a successful sign-in).
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
    resetNavigationStackThenReplace("/(org)");
    return;
  }

  const explicitDestination = resolveReturnTo(returnTo);
  if (explicitDestination) {
    // Clear any persisted intent: the explicit returnTo already encodes the
    // destination, so the intent is no longer needed.
    clearDonationIntent();
    resetNavigationStackThenReplace(explicitDestination);
    return;
  }

  // No returnTo in navigation params: check for a persisted donation intent.
  const intent = await loadDonationIntent();
  if (intent) {
    await clearDonationIntent();
    const qp = new URLSearchParams();
    if (intent.campaignId) qp.set("campaignId", intent.campaignId);
    if (intent.amount != null) qp.set("amount", String(intent.amount));
    const qs = qp.toString();
    const destination = `/donate/${intent.orgId}${qs ? `?${qs}` : ""}` as Href;
    resetNavigationStackThenReplace(destination);
    return;
  }

  resetNavigationStackThenReplace("/(tabs)");
}
