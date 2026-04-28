/**
 * Same portrait pool as `apps/api/src/lib/donor-portrait.ts` (`@giveblack/shared`).
 */

import {
  defaultDonorPlaceholderPortraitUrl,
  donorPlaceholderImageSeed,
} from "@giveblack/shared";

export { donorPlaceholderImageSeed };

/** @param stableKey user id, email, or any stable string for this donor row */
export function placeholderDonorPhoto(
  stableKey: string,
  firstNameRaw: string,
  lastNameRaw?: string | null
): string {
  return defaultDonorPlaceholderPortraitUrl(stableKey, firstNameRaw, lastNameRaw);
}
