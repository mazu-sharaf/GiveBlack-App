import { Platform } from "react-native";

let googleConfigured = false;

/** Resolved Google Sign-In API object (Metro may nest exports under `default`). */
type GoogleSigninApi = import("@react-native-google-signin/google-signin").GoogleSignin;

/**
 * Metro dynamic `import()` sometimes puts named exports on `default` — avoid undefined `GoogleSignin`.
 */
async function getGoogleSigninApi(): Promise<GoogleSigninApi> {
  const mod = await import("@react-native-google-signin/google-signin");
  const gs =
    mod.GoogleSignin ??
    (mod as { default?: { GoogleSignin?: GoogleSigninApi } }).default?.GoogleSignin ??
    (mod as { default?: GoogleSigninApi }).default;

  if (gs && typeof gs.configure === "function") {
    return gs;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = require("@react-native-google-signin/google-signin") as typeof mod;
    const gs2 =
      req.GoogleSignin ??
      (req as { default?: { GoogleSignin?: GoogleSigninApi } }).default?.GoogleSignin ??
      (req as { default?: GoogleSigninApi }).default;
    if (gs2 && typeof gs2.configure === "function") {
      return gs2;
    }
  } catch {
    /* native module missing */
  }

  throw new Error(
    "RNGoogleSignin could not be found. Google Sign-In requires a development or production build with native code (expo run:ios / run:android or EAS), not Expo Go."
  );
}

export async function configureGoogleSignIn(): Promise<void> {
  if (googleConfigured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    if (__DEV__) {
      console.warn("[oauth] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set");
    }
    return;
  }
  const GoogleSignin = await getGoogleSigninApi();
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  GoogleSignin.configure(
    iosClientId ? { webClientId, iosClientId } : { webClientId }
  );
  googleConfigured = true;
}

export async function getGoogleIdToken(): Promise<string> {
  await configureGoogleSignIn();
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    throw new Error("Google Sign-In is not configured in the app (missing web client ID).");
  }
  const GoogleSignin = await getGoogleSigninApi();
  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }
  const res = await GoogleSignin.signIn();
  if (res.type !== "success") {
    throw new Error("cancelled");
  }
  const idToken = res.data.idToken;
  if (!idToken) {
    throw new Error(
      "No ID token from Google. Ensure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID matches your Google Cloud OAuth Web client and server GOOGLE_OAUTH_CLIENT_IDS includes the same audience."
    );
  }
  return idToken;
}
