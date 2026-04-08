import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Platform } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
/** Same asset as app.json `expo.splash.image` for a seamless handoff after native splash hides. */
const splashImage = require("@/assets/images/splash-logo.png");

/** Matches app.json splash.backgroundColor */
const SPLASH_BG = "#FFFFFF";

type Props = {
  onComplete: () => void;
};

/**
 * Full-screen splash after native splash: logo scale + fade in, brief hold, then fade out.
 * Call only while native splash is still visible; we hide it once this view is mounted.
 */
export function SplashLogoAnimation({ onComplete }: Props) {
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.88)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onComplete();
    };

    const run = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        /* ignore — web or double-call */
      }

      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: Platform.OS === "web" ? 400 : 520,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        timeoutId = setTimeout(() => {
          Animated.timing(containerOpacity, {
            toValue: 0,
            duration: 380,
            useNativeDriver: true,
          }).start(({ finished: f }) => {
            if (f) finish();
          });
        }, 420);
      });
    };

    run();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [containerOpacity, logoOpacity, logoScale, onComplete]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity: containerOpacity }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.inner}>
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          <Image
            source={splashImage}
            style={styles.logo}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BG,
    zIndex: 100000,
    elevation: 100000,
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  logo: {
    width: 220,
    height: 72,
  },
});
