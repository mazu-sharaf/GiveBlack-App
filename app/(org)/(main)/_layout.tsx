import React, { useEffect } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Text,
  useWindowDimensions,
} from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import AppHeader from "@/components/AppHeader";

interface TabDef {
  name: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
}

const TABS: TabDef[] = [
  { name: "index", title: "Dashboard", icon: "grid-outline", iconFilled: "grid" },
  { name: "campaigns", title: "Campaigns", icon: "megaphone-outline", iconFilled: "megaphone" },
  { name: "donations", title: "Donations", icon: "heart-outline", iconFilled: "heart" },
  { name: "subscriptions", title: "Plans", icon: "diamond-outline", iconFilled: "diamond" },
  { name: "settings", title: "Settings", icon: "settings-outline", iconFilled: "settings" },
];

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 200,
  mass: 0.8,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

const TAB_COUNT = TABS.length;
const PILL_H = 48;
const BAR_H_PADDING = 6;

function OrgTabBar({ state, navigation }: any) {
  const { isDark } = useTheme();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const barWidth = Math.min(screenWidth - 32, 420);
  const tabWidth = (barWidth - BAR_H_PADDING * 2) / TAB_COUNT;
  const pillWidth = tabWidth - 4;

  const translateX = useSharedValue(state.index * tabWidth + BAR_H_PADDING + 2);

  useEffect(() => {
    const target = state.index * tabWidth + BAR_H_PADDING + 2;
    translateX.value = withSpring(target, SPRING_CONFIG);
  }, [state.index, tabWidth]);

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: pillWidth,
  }));

  return (
    <View
      style={[
        styles.tabBarOuter,
        { paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      <View
        style={[
          styles.tabBarInner,
          {
            width: barWidth,
            backgroundColor: isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.97)",
            borderColor: c.border,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.pill,
            {
              height: PILL_H,
              backgroundColor: c.green + "18",
              borderRadius: 24,
            },
            pillAnimatedStyle,
          ]}
        />
        {state.routes.map((route: any, index: number) => {
          const tab = TABS.find((t) => t.name === route.name) || TABS[index];
          if (!tab) return null;
          const isFocused = state.index === index;

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                if (!isFocused) {
                  navigation.navigate(route.name);
                }
              }}
              style={[styles.tab, { width: tabWidth }]}
            >
              <Ionicons
                name={isFocused ? tab.iconFilled : tab.icon}
                size={tab.name === "subscriptions" ? 17 : 20}
                color={isFocused ? c.green : c.textMuted}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? c.green : c.textMuted },
                ]}
                numberOfLines={1}
              >
                {tab.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function OrgTabsLayout() {
  const c = useThemeColors();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader variant="org" title="Dashboard" showSearch={false} />
      <Tabs
        tabBar={(props) => <OrgTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="campaigns" />
        <Tabs.Screen name="donations" />
        <Tabs.Screen name="subscriptions" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 8,
  },
  tabBarInner: {
    flexDirection: "row",
    height: PILL_H + 8,
    borderRadius: 28,
    alignItems: "center",
    paddingHorizontal: BAR_H_PADDING,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      web: { boxShadow: "0 4px 24px rgba(0,0,0,0.08)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  pill: {
    position: "absolute",
    top: 4,
    left: 0,
  },
  tab: {
    height: PILL_H,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    marginTop: 1,
  },
});
