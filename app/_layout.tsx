import React from "react";
import { View, Platform } from "react-native";
import { Stack } from "expo-router";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import StripeProviderWrapper from "@/components/StripeProviderWrapper";

function InnerLayout() {
  const { isDark, colors: c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }} />
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
