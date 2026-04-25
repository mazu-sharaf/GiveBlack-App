/**
 * Production OAuth client IDs for @react-native-google-signin/google-signin.
 * Must match Google Cloud Console (same project). iOS URL scheme is derived for Expo prebuild.
 */
export const GOOGLE_IOS_CLIENT_ID =
  "1015872793306-67gnhk1b900k459o28hm2g6rvmvov482.apps.googleusercontent.com";

export const GOOGLE_WEB_CLIENT_ID =
  "1015872793306-ic0otulkht3m258h9utqake2m0unirlu.apps.googleusercontent.com";

const IOS_CLIENT_SUFFIX = ".apps.googleusercontent.com";

/** Reversed client id — used by @react-native-google-signin iOS URL types. */
export const GOOGLE_IOS_URL_SCHEME = `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.slice(
  0,
  -IOS_CLIENT_SUFFIX.length
)}`;

export const GOOGLE_NATIVE_SIGN_IN_SCOPES = ["profile", "email"] as const;
