import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Dimensions } from "react-native";

// Metro automatically serves splash-logo-opt@2x.png / @3x.png
// on the matching display density, so the image is always crisp
// without loading an oversized file on low-density screens.
const LOGO = require("@/assets/images/splash-logo-opt.png");
// Background matches the outer edge of the splash logo watercolor.
const BG_COLOR = "#E8F4DC";
const LOGO_SIZE = Math.round(Dimensions.get("window").width * 0.72);

// Total visible time breakdown:
//   ~300ms  spring scale-in
//   ~1900ms hold
//   ~450ms  fade out
// = ~2650ms before onComplete fires → app appears at ~2.7s

type Props = {
  onComplete: () => void;
};

export function SplashAnimation({ onComplete }: Props) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const done = () => onComplete();

    // Phase 1: spring scale-in + fade-in together
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Phase 2: hold for 1900ms, then fade out the whole screen
      const holdTimer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) done();
        });
      }, 1900);

      return () => clearTimeout(holdTimer);
    });
  }, [onComplete, scale, logoOpacity, opacity]);

  return (
    <Animated.View
      style={[styles.root, { opacity }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.center}>
        <Animated.Image
          source={LOGO}
          style={[
            styles.logo,
            {
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              opacity: logoOpacity,
              transform: [{ scale }],
            },
          ]}
          resizeMode="contain"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG_COLOR,
    zIndex: 999999,
    elevation: 999999,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    // size set dynamically above
  },
});
