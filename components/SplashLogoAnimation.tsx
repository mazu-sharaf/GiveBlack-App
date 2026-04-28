import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";

const splashImage = require("@/assets/images/splash-image.png");

const SPLASH_BG = "#E9EFD6";

type Props = {
  onComplete: () => void;
  ready?: boolean;
};

export function SplashLogoAnimation({ onComplete, ready = true }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onComplete();
    };

    const run = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        /* ignore: web or double-call */
      }

      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: Platform.OS === "web" ? 150 : 200,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) finish();
        });
      }, 2000);
    };

    run();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ready, opacity, onComplete]);

  return (
    <Animated.View
      style={[styles.root, { opacity, pointerEvents: "none" }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={splashImage}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
        transition={0}
      />
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
  image: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
});
