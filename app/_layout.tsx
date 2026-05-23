import React, { useState, useCallback, useEffect } from "react";
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
import { SplashAnimation } from "@/components/SplashAnimation";

// Hold the native splash until the JS bundle is ready.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function InnerLayout({ ready }: { ready: boolean }) {
  const { isDark, colors: c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {ready ? (
        <>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: c.background },
            }}
          />
          <NotificationNavigationHandler />
        </>
      ) : null}
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

  const [splashDone, setSplashDone] = useState(false);
  const onSplashComplete = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (!fontsLoaded) return;
    // Dismiss the native splash instantly so our JS animation is the
    // only thing shown. This prevents the Android double-logo issue
    // where the native splash icon overlaps our animated overlay.
    void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Render nothing until fonts are ready — native splash covers this gap.
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <StripeProviderWrapper>
            <SafeAreaProvider>
              {/* InnerLayout only renders the Stack once splash is done.
                  Contexts above mount immediately so auth/session/data
                  preload in the background while the splash plays. */}
              <InnerLayout ready={splashDone} />
              {!splashDone && (
                <SplashAnimation onComplete={onSplashComplete} />
              )}
            </SafeAreaProvider>
          </StripeProviderWrapper>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
