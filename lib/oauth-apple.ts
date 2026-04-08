import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import type { AppleAuthenticationFullName } from "expo-apple-authentication";

function formatAppleFullName(full: AppleAuthenticationFullName | null): string | undefined {
  if (!full) return undefined;
  const parts = [full.givenName, full.familyName].filter(Boolean) as string[];
  const s = parts.join(" ").trim();
  return s || undefined;
}

export async function getAppleOAuthPayload(): Promise<{ identityToken: string; fullName?: string }> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple Sign-In is only available on iOS.");
  }
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error("Apple Sign-In is not available on this device.");
  }
  const cred = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!cred.identityToken) {
    throw new Error("No identity token from Apple.");
  }
  const fullName = formatAppleFullName(cred.fullName);
  return { identityToken: cred.identityToken, ...(fullName ? { fullName } : {}) };
}
