import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { Redirect, type Href } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useThemeColors } from "@/context/ThemeContext";
import { hasCompletedOnboarding } from "@/lib/onboarding-storage";
import { resetNavigationStackThenReplace } from "@/lib/auth-navigation";
import { loadDonationIntent } from "@/lib/donation-intent";

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
  const [donorHomeHref, setDonorHomeHref] = useState<Href>("/(tabs)");
  const guestStartedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      if (user.type === "charity") {
        setAuthGateReady(true);
        return;
      }

      let active = true;
      void (async () => {
        try {
          const intent = await loadDonationIntent();
          if (!active) return;
          if (intent?.pendingSafariCheckout && intent.orgId) {
            const qp = new URLSearchParams();
            if (intent.campaignId) qp.set("campaignId", intent.campaignId);
            if (intent.amount != null) qp.set("amount", String(intent.amount));
            const qs = qp.toString();
            setDonorHomeHref(`/donate/${intent.orgId}${qs ? `?${qs}` : ""}` as Href);
          } else {
            setDonorHomeHref("/(tabs)");
          }
        } finally {
          if (active) setAuthGateReady(true);
        }
      })();

      return () => {
        active = false;
      };
    }

    if (guestStartedRef.current) return;
    guestStartedRef.current = true;
    hasCompletedOnboarding().then(async (seen) => {
      setSeenOnboarding(seen);
      if (seen) {
        try {
          await guestLogin();
        } catch (e) {
          console.log("Guest bootstrap failed:", e instanceof Error ? e.message : String(e));
          setAuthGateReady(true);
        }
        return;
      }
      setAuthGateReady(true);
    });
  }, [isLoading, isAuthenticated, user, guestLogin]);

  if (isLoading || !authGateReady) {
    return <View style={[styles.centered, { backgroundColor: c.background }]} />;
  }

  if (!isAuthenticated && !seenOnboarding) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  if (user?.type === "charity") {
    return <CharityAuthedBootstrap />;
  }

  return <Redirect href={donorHomeHref} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
