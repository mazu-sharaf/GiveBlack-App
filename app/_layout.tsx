import React, { useState, useCallback } from "react";
import { View, Platform } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import StripeProviderWrapper from "@/components/StripeProviderWrapper";
import { NotificationNavigationHandler } from "@/components/NotificationNavigationHandler";
import { SplashLogoAnimation } from "@/components/SplashLogoAnimation";

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
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 26,
            backgroundColor: "transparent",
            zIndex: 9999,
          }}
        />
      )}
    </View>
  );
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const onSplashComplete = useCallback(() => setSplashDone(true), []);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    ...Ionicons.font,
  });

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <StripeProviderWrapper>
            <SafeAreaProvider>
              {fontsLoaded && <InnerLayout />}
              {!splashDone && (
                <SplashLogoAnimation
                  onComplete={onSplashComplete}
                  ready={fontsLoaded}
                />
              )}
            </SafeAreaProvider>
          </StripeProviderWrapper>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
