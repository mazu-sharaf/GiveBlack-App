/**
 * Extends base Expo config with env-driven native plugin options.
 * EAS Build: set EXPO_PUBLIC_* in eas.json env or EAS Secrets so prebuild receives them.
 */
module.exports = ({ config }) => {
  const basePlugins = (config.plugins || []).filter(
  (p) =>
    p !== "@react-native-google-signin/google-signin" &&
    p !== "react-native-fbsdk-next" &&
    p !== "expo-apple-authentication"
  );

  const googleScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  const googlePlugin = googleScheme
    ? ["@react-native-google-signin/google-signin", { iosUrlScheme: googleScheme }]
    : "@react-native-google-signin/google-signin";

  return {
    ...config,
    plugins: [...basePlugins, googlePlugin, "expo-apple-authentication"],
  };
};
