import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import type { AppleAuthenticationFullName } from "expo-apple-authentication";
import Constants from "expo-constants";
import { maskJwtPrefix, shouldLogAuthVerbose } from "@/lib/auth-debug";

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
  if (shouldLogAuthVerbose()) {
    const bid = Constants.expoConfig?.ios?.bundleIdentifier;
    console.log("[oauth-apple] isAvailableAsync", available, "bundleId", bid ?? "(unknown)");
  }
  if (!available) {
    throw new Error(
      "Apple Sign-In is not available on this device. Confirm the app uses bundle id com.giveblack.app, Sign in with Apple is enabled for that App ID, and a new native build was installed."
    );
  }
  let cred: AppleAuthentication.AppleAuthenticationCredential;
  try {
    cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
    console.warn("[oauth-apple] signInAsync failed", code || "(no code)", e instanceof Error ? e.message : String(e));
    throw e;
  }
  if (!cred.identityToken) {
    throw new Error("No identity token from Apple.");
  }
  if (shouldLogAuthVerbose()) {
    console.log("[oauth-apple] signIn ok", { identityToken: maskJwtPrefix(cred.identityToken), hasFullName: !!cred.fullName });
  }
  const fullName = formatAppleFullName(cred.fullName);
  return { identityToken: cred.identityToken, ...(fullName ? { fullName } : {}) };
}
