import React, { useEffect } from "react";
import { View, Platform } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import StripeProviderWrapper from "@/components/StripeProviderWrapper";
import { NotificationNavigationHandler } from "@/components/NotificationNavigationHandler";

// Hold the native splash until fonts are ready, then dismiss instantly.
// No JS overlay - the OS hides the native splash in a single frame and
// the app appears underneath, so users never see a "loading" stage.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function InnerLayout() {
  const { isDark, colors: c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          /** Match theme so iOS home-indicator / safe area never shows default white behind screens */
          contentStyle: { backgroundColor: c.background },
        }}
      />
      <NotificationNavigationHandler />
      {/* Dev-only overlay to catch bottom safe-area, kept transparent so it doesn't show a bar */}
      {__DEV__ && Platform.OS !== "web" && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 26,
            backgroundColor: "transparent",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        />
      )}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    ...Ionicons.font,
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <StripeProviderWrapper>
            <SafeAreaProvider>
              <InnerLayout />
            </SafeAreaProvider>
          </StripeProviderWrapper>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
