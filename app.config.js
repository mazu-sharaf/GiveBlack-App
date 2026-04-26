/**
 * Dynamic Expo config — uses Expo’s ({ config }) merge so `app.json` stays the base (expo doctor).
 * EAS Build: set EXPO_PUBLIC_* in eas.json env or EAS Secrets so prebuild receives them.
 */
/** Matches lib/google-signin-config.ts when env is unset (EAS / local prebuild). */
const FALLBACK_GOOGLE_IOS_URL_SCHEME =
  "com.googleusercontent.apps.686496134866-k5a914jeu1b3si5gl4ratimoaphll6f3";

function resolveGoogleIosUrlScheme() {
  const fromEnv = (process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || "").trim();
  if (fromEnv) return fromEnv;
  const iosClientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "").trim();
  const suffix = ".apps.googleusercontent.com";
  if (iosClientId.endsWith(suffix)) {
    return `com.googleusercontent.apps.${iosClientId.slice(0, -suffix.length)}`;
  }
  return FALLBACK_GOOGLE_IOS_URL_SCHEME;
}

module.exports = ({ config }) => {
  const expo = config.expo ?? config;
  const basePlugins = (expo.plugins || []).filter(
    (p) =>
      p !== "@react-native-google-signin/google-signin" &&
      p !== "react-native-fbsdk-next" &&
      p !== "expo-apple-authentication"
  );

  const googleScheme = resolveGoogleIosUrlScheme();
  const googlePlugin = googleScheme
    ? ["@react-native-google-signin/google-signin", { iosUrlScheme: googleScheme }]
    : "@react-native-google-signin/google-signin";

  return {
    ...config,
    expo: {
      ...expo,
      plugins: [...basePlugins, googlePlugin, "expo-apple-authentication"],
    },
  };
};
