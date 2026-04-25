import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useThemeColors } from "@/context/ThemeContext";
import { hasCompletedOnboarding } from "@/lib/onboarding-storage";

export default function Index() {
  const { isAuthenticated, isLoading, user, guestLogin } = useAuth();
  const c = useThemeColors();
  const [authGateReady, setAuthGateReady] = useState(false);
  const [seenOnboarding, setSeenOnboarding] = useState(false);
  const guestStartedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      setAuthGateReady(true);
      return;
    }
    if (guestStartedRef.current) return;
    hasCompletedOnboarding().then(async (seen) => {
      setSeenOnboarding(seen);
      if (seen) {
        guestStartedRef.current = true;
        try {
          await guestLogin();
        } finally {
          setAuthGateReady(true);
        }
      } else {
        setAuthGateReady(true);
      }
    });
  }, [isLoading, isAuthenticated, guestLogin]);

  if (isLoading || !authGateReady) {
    return <View style={[styles.centered, { backgroundColor: c.background }]} />;
  }

  if (!isAuthenticated && !seenOnboarding) {
    return <Redirect href="/(auth)/onboarding" />;
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
