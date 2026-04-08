import { Alert } from "react-native";
import { router } from "expo-router";

/** Show alerts for failed donor OAuth; no-op on success or user cancel. */
export function alertDonorOAuthFailure(
  r: { success: boolean; error?: string; errorType?: string },
  conflictMode: "welcome" | "donor-auth"
): void {
  if (r.success || r.errorType === "cancelled") return;
  const msg = r.error?.trim() || "Sign-in failed. Please try again.";
  if (r.errorType === "conflict") {
    if (conflictMode === "welcome") {
      Alert.alert("Account exists", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Sign in with password", onPress: () => router.push("/(auth)/donor-login") },
      ]);
    } else {
      Alert.alert("Account exists", msg, [
        { text: "OK", style: "cancel" },
        { text: "Sign up", onPress: () => router.push("/(auth)/donor-signup") },
      ]);
    }
    return;
  }
  Alert.alert("Sign-in", msg);
}
