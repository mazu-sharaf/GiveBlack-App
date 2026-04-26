/**
 * Dynamic Expo config — keeps `app.json` as the base config (expo doctor).
 * EAS Build: set EXPO_PUBLIC_* in eas.json env or EAS Secrets so prebuild receives them.
 */
function resolveGoogleIosUrlScheme(): string | undefined {
  const fromEnv = (process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || "").trim();
  if (fromEnv) return fromEnv;

  const iosClientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "").trim();
  const suffix = ".apps.googleusercontent.com";
  if (iosClientId.endsWith(suffix)) {
    return `com.googleusercontent.apps.${iosClientId.slice(0, -suffix.length)}`;
  }

  return undefined;
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
