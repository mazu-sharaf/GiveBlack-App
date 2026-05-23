import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Dimensions } from "react-native";

// Metro automatically serves splash-logo-opt@2x.png / @3x.png
// on the matching display density, so the image is always crisp
// without loading an oversized file on low-density screens.
const LOGO = require("@/assets/images/splash-logo-opt.png");
// Background matches the outer edge of the splash logo watercolor.
const BG_COLOR = "#E8F4DC";
// Smaller, more refined logo size (~half the screen width).
const LOGO_SIZE = Math.round(Dimensions.get("window").width * 0.5);

// Snappy preloader pacing:
//   ~220ms   spring scale-in + fade-in (logo appears almost instantly)
//   ~1600ms  hold with subtle pulse
//   ~380ms   fade out
// = ~2200ms total before onComplete fires → home page revealed
const SCALE_IN_MS = 220;
const HOLD_MS = 1600;
const FADE_OUT_MS = 380;

type Props = {
  onComplete: () => void;
};

export function SplashAnimation({ onComplete }: Props) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (!cancelled) onComplete();
    };

    // Phase 1: snappy spring scale-in + logo fade-in
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: SCALE_IN_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (cancelled) return;

      // Phase 1b: subtle pulse loop during the hold to signal "loading"
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.06,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Phase 2: hold, then fade out the whole overlay
      const holdTimer = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) done();
        });
      }, HOLD_MS);

      return () => clearTimeout(holdTimer);
    });

    return () => {
      cancelled = true;
    };
  }, [onComplete, scale, logoOpacity, opacity, pulse]);

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
              transform: [
                { scale: Animated.multiply(scale, pulse) },
              ],
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
