import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import {
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_NATIVE_SIGN_IN_SCOPES,
  GOOGLE_WEB_CLIENT_ID,
} from "@/lib/google-signin-config";

let googleConfigured = false;
let configurePromise: Promise<void> | null = null;

function isExpoGoOrWeb(): boolean {
  if (Platform.OS === "web") return true;
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Resolved Google Sign-In API object (Metro may nest exports under `default`). */
type GoogleSigninApi = import("@react-native-google-signin/google-signin").GoogleSignin;

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

/**
 * Call once at app startup (e.g. AuthProvider). Idempotent; safe to await from getGoogleIdToken as well.
 */
export async function configureGoogleSignIn(): Promise<void> {
  if (googleConfigured) return;
  if (isExpoGoOrWeb()) return;

  if (!configurePromise) {
    configurePromise = (async () => {
      const GoogleSignin = await getGoogleSigninApi();
      if (Platform.OS === "ios") {
        GoogleSignin.configure({
          iosClientId: GOOGLE_IOS_CLIENT_ID,
          webClientId: GOOGLE_WEB_CLIENT_ID,
          scopes: [...GOOGLE_NATIVE_SIGN_IN_SCOPES],
        });
      } else {
        GoogleSignin.configure({
          webClientId: GOOGLE_WEB_CLIENT_ID,
          scopes: [...GOOGLE_NATIVE_SIGN_IN_SCOPES],
        });
      }
      console.log("Google Sign-In configured");
      console.log("iOS Client:", GOOGLE_IOS_CLIENT_ID);
      console.log("Web Client:", GOOGLE_WEB_CLIENT_ID);
      googleConfigured = true;
    })();
  }

  try {
    await configurePromise;
  } catch (e) {
    configurePromise = null;
    throw e;
  }
}

export async function getGoogleIdToken(): Promise<string> {
  if (isExpoGoOrWeb()) {
    throw new Error(
      "Google Sign-In requires a development or production build with native code (EAS / expo run), not Expo Go or web."
    );
  }

  await configureGoogleSignIn();
  if (!googleConfigured) {
    throw new Error("Google Sign-In did not finish initializing.");
  }

  const GoogleSignin = await getGoogleSigninApi();

  try {
    if (Platform.OS === "android") {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const userInfo = await GoogleSignin.signIn();
    console.log("User:", userInfo);
    if (userInfo.type !== "success") {
      throw new Error("cancelled");
    }
    const idToken = userInfo.data.idToken;
    if (!idToken) {
      throw new Error(
        "No ID token from Google. Ensure GOOGLE_WEB_CLIENT_ID matches your Web OAuth client and the API accepts that audience in GOOGLE_OAUTH_CLIENT_IDS."
      );
    }
    return idToken;
  } catch (error: unknown) {
    console.error("Google Sign-In Error:", error);
    throw error;
  }
}
