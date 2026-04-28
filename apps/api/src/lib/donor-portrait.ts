/**
 * Placeholder portraits when a donor has no uploaded `avatar_url`.
 * Curated Black portrait stock (see `@giveblack/shared`). Hash rotates faces per donor.
 */

import {
  defaultDonorPlaceholderPortraitUrl,
  donorPlaceholderImageSeed,
  resolveDonorPlaceholderPortraitUrl,
} from "@giveblack/shared";

export { donorPlaceholderImageSeed };

export function defaultDonorPortraitUrl(
  userId: string,
  firstNameRaw: string,
  lastNameRaw?: string | null
): string {
  return defaultDonorPlaceholderPortraitUrl(userId, firstNameRaw, lastNameRaw);
}

export function resolveDonorAvatarUrl(
  userId: string,
  firstName: string,
  storedAvatarUrl: string | null | undefined,
  lastName?: string | null
): string {
  return resolveDonorPlaceholderPortraitUrl(userId, firstName, storedAvatarUrl, lastName);
}
