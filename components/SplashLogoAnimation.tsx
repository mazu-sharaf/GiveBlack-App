import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";

const splashImage = require("@/assets/images/splash-image.jpg");

const SPLASH_BG = "#E9EFD6";

type Props = {
  onComplete: () => void;
};

export function SplashLogoAnimation({ onComplete }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
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

      timeoutId = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: Platform.OS === "web" ? 200 : 280,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) finish();
        });
      }, 3000);
    };

    run();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [opacity, onComplete]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={splashImage}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory"
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
