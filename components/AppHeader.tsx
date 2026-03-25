import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeInsets } from "@/lib/safe-area";
import { useTheme, useThemeColors } from "@/context/ThemeContext";

interface AppHeaderProps {
  variant?: "donor" | "org";
  title?: string;
  showBack?: boolean;
  showNotifications?: boolean;
  showSearch?: boolean;
  rightAction?: React.ReactNode;
}

export default function AppHeader({
  variant = "donor",
  title,
  showBack = false,
  showNotifications = true,
  showSearch = true,
  rightAction,
}: AppHeaderProps) {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { isDark } = useTheme();

  const logoSource = isDark
    ? require("@/assets/images/logo-white.webp")
    : require("@/assets/images/logo-black.webp");

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 4,
          backgroundColor: c.background,
          borderBottomColor: c.border,
        },
      ]}
    >
      <View style={styles.inner}>
        <View style={styles.left}>
          {showBack && (
            <Pressable
              style={[styles.backBtn, { backgroundColor: c.cardBg }]}
              onPress={() => router.back()}
              hitSlop={6}
            >
              <Ionicons name="chevron-back" size={20} color={c.text} />
            </Pressable>
          )}
          {!showBack && (
            <>
              <Image source={logoSource} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />
              {title ? (
                <View style={styles.dividerWrap}>
                  <View style={[styles.divider, { backgroundColor: c.border }]} />
                  <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
                    {title}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.center}>
          {showBack && title ? (
            <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          {rightAction}
          {showSearch && (
            <Pressable
              style={[styles.iconBtn, { backgroundColor: c.cardBg }]}
              onPress={() => router.push("/search")}
              hitSlop={6}
            >
              <Ionicons name="search-outline" size={19} color={c.text} />
            </Pressable>
          )}
          {showNotifications && (
            <Pressable
              style={[styles.iconBtn, { backgroundColor: c.cardBg }]}
              onPress={() => router.push("/notifications")}
              hitSlop={6}
            >
              <Ionicons name="notifications-outline" size={19} color={c.text} />
              <View style={[styles.notifDot, { borderColor: c.cardBg }]} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 120,
    height: 28,
  },
  dividerWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 2,
    flex: 1,
    minWidth: 0,
  },
  divider: {
    width: 1,
    height: 18,
    marginRight: 10,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    flexShrink: 1,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  notifDot: {
    position: "absolute",
    top: 6,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
    borderWidth: 1.5,
  },
});
