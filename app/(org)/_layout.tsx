import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useThemeColors } from "@/context/ThemeContext";

/**
 * Org routes are for approved charity accounts only. Donors or guests who land here
 * (e.g. stale stack, deep link) are sent to the main app instead of a blocking screen.
 */
export default function OrgLayout() {
  const { user, isLoading, isAuthenticated, isGuest } = useAuth();
  const c = useThemeColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <ActivityIndicator size="large" color={c.green} />
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (isGuest || user.type !== "charity") {
    // Donor shell: `/(tabs)` is the tab group; index route has no `/index` segment in the URL.
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(main)" />
      <Stack.Screen name="volunteers" />
    </Stack>
  );
}
