import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useThemeColors } from "@/context/ThemeContext";
import { hasCompletedOnboarding } from "@/lib/onboarding-storage";
import { resetNavigationStackThenReplace } from "@/lib/auth-navigation";

/** Charity cold start: `<Redirect href="/(org)" />` can leave `/` in the root stack so swipe-back returns here; reset like post-login. */
function CharityAuthedBootstrap() {
  const c = useThemeColors();
  useLayoutEffect(() => {
    resetNavigationStackThenReplace("/(org)");
  }, []);
  return <View style={[styles.centered, { backgroundColor: c.background }]} />;
}

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
    guestStartedRef.current = true;
    hasCompletedOnboarding().then(async (seen) => {
      setSeenOnboarding(seen);
      if (seen) {
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
    return <CharityAuthedBootstrap />;
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
