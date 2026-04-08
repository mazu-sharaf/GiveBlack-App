/**
 * Extends app.json with env-driven native plugin options (Google iOS URL scheme).
 * EAS Build: set EXPO_PUBLIC_* in eas.json env or EAS Secrets so prebuild receives them.
 */
const appJson = require("./app.json");

const basePlugins = (appJson.expo.plugins || []).filter(
  (p) =>
    p !== "@react-native-google-signin/google-signin" &&
    p !== "react-native-fbsdk-next" &&
    p !== "expo-apple-authentication"
);

const googleScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
const googlePlugin = googleScheme
  ? ["@react-native-google-signin/google-signin", { iosUrlScheme: googleScheme }]
  : "@react-native-google-signin/google-signin";

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [...basePlugins, googlePlugin, "expo-apple-authentication"],
  },
};
