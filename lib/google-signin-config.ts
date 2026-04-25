/**
 * Google OAuth client IDs for @react-native-google-signin/google-signin.
 * Values are read from EXPO_PUBLIC_ env vars (baked in at build time by Expo)
 * with hardcoded fallbacks matching the GiveBlack Firebase/Google Cloud project.
 */
export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  "686496134866-k5a914jeu1b3si5gl4ratimoaphll6f3.apps.googleusercontent.com";

export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  "686496134866-ffpjjko0fr870aomrnvmqp881if51i2h.apps.googleusercontent.com";

const IOS_CLIENT_SUFFIX = ".apps.googleusercontent.com";

/** Reversed client id — used by @react-native-google-signin iOS URL types. */
export const GOOGLE_IOS_URL_SCHEME =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ??
  `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.slice(0, -IOS_CLIENT_SUFFIX.length)}`;

export const GOOGLE_NATIVE_SIGN_IN_SCOPES = ["profile", "email"] as const;
