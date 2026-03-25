import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, useThemeColors } from "@/context/ThemeContext";

interface HeroSectionProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export default function HeroSection({ children, style }: HeroSectionProps) {
  const { isDark } = useTheme();
  const c = useThemeColors();

  const startColor = isDark ? "#0B3020" : "#0C3B27";
  const midColor = isDark ? "#0D4128" : c.green;
  const endColor = isDark ? "#0B3020" : "#0C3B27";

  return (
    <LinearGradient
      colors={[startColor, midColor, endColor]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, style]}
    >
      <View style={styles.inner}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  inner: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
});

