import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useThemeColors } from "@/context/ThemeContext";
import { hasCompletedOnboarding } from "@/lib/onboarding-storage";

export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const c = useThemeColors();
  const [authGateReady, setAuthGateReady] = useState(false);
  const [seenOnboarding, setSeenOnboarding] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      setAuthGateReady(true);
      return;
    }
    hasCompletedOnboarding().then((seen) => {
      setSeenOnboarding(seen);
      setAuthGateReady(true);
    });
  }, [isLoading, isAuthenticated]);

  if (isLoading || !authGateReady) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.green} />
      </View>
    );
  }

  if (!isAuthenticated && !seenOnboarding) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (user?.type === "charity") {
    return <Redirect href="/(org)" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
