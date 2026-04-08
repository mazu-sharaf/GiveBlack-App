/**
 * Detect user-cancelled Google Sign-In without importing `@react-native-google-signin/google-signin`
 * at module load (that package touches RNGoogleSignin and crashes in Expo Go / missing dev client).
 */
export function isGoogleSignInUserCancelled(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  if (!("code" in e)) return false;
  const code = String((e as { code: unknown }).code);
  return code === "SIGN_IN_CANCELLED" || code === "12501" || code === "-5";
}
