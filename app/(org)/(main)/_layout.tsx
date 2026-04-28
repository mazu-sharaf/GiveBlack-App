import React, { useEffect } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Text,
  useWindowDimensions,
} from "react-native";
import { Tabs, router } from "expo-router";
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
  { name: "index",     title: "Dashboard", icon: "grid-outline",     iconFilled: "grid"      },
  { name: "campaigns", title: "Campaigns", icon: "megaphone-outline", iconFilled: "megaphone" },
  { name: "donations", title: "Donations", icon: "heart-outline",     iconFilled: "heart"     },
  { name: "settings",  title: "Settings",  icon: "settings-outline",  iconFilled: "settings"  },
];

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 200,
  mass: 0.8,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

const TAB_COUNT  = TABS.length;
const PILL_H     = 48;
const BAR_PAD    = 6;
const BAR_H      = PILL_H + BAR_PAD * 2;
const FAB_SIZE   = 52;
const FAB_RISE   = 14;
const BAR_COLOR  = "#1C1C1E";

function OrgTabBar({ state, navigation }: any) {
  const { isDark } = useTheme();
  const c          = useThemeColors();
  const insets     = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const barWidth = Math.min(screenWidth - 32, 420);

  const slotCount = TAB_COUNT + 1;
  const tabWidth  = (barWidth - BAR_PAD * 2) / slotCount;
  const pillWidth = tabWidth - 4;

  const centerSlot = Math.floor(slotCount / 2);

  const getSlotIndex = (visibleTabIndex: number) =>
    visibleTabIndex < centerSlot ? visibleTabIndex : visibleTabIndex + 1;

  const activeRouteName  = state.routes[state.index]?.name ?? "";
  const activeTabIndex   = TABS.findIndex((t) => t.name === activeRouteName);
  const activeSlotIndex  = activeTabIndex >= 0 ? getSlotIndex(activeTabIndex) : 0;

  const translateX = useSharedValue(activeSlotIndex * tabWidth + BAR_PAD + 2);

  useEffect(() => {
    const target = activeSlotIndex * tabWidth + BAR_PAD + 2;
    translateX.value = withSpring(target, SPRING_CONFIG);
  }, [activeSlotIndex, tabWidth]);

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: pillWidth,
  }));

  const handleAddCampaign = () => {
    navigation.navigate("campaigns", { openCreate: "1" });
  };

  const fabBottom = BAR_H / 2 + FAB_RISE - FAB_SIZE / 2;

  return (
    <View
      style={[
        styles.tabBarOuter,
        { paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      <View style={[styles.barContainer, { width: barWidth }]}>
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

          {TABS.map((tab, index) => {
            const route    = state.routes.find((r: any) => r.name === tab.name);
            if (!route) return null;
            const isFocused = state.routes[state.index]?.name === tab.name;

            const tabItem = (
              <Pressable
                key={route.key}
                onPress={() => {
                  if (!isFocused) navigation.navigate(route.name);
                }}
                style={[styles.tab, { width: tabWidth }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={tab.title}
              >
                <Ionicons
                  name={isFocused ? tab.iconFilled : tab.icon}
                  size={20}
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

            if (index === centerSlot - 1) {
              return (
                <React.Fragment key={route.key}>
                  {tabItem}
                  <View style={[styles.tab, { width: tabWidth }]} />
                </React.Fragment>
              );
            }

            return tabItem;
          })}
        </View>

        <Pressable
          style={[
            styles.fab,
            {
              backgroundColor: BAR_COLOR,
              bottom: fabBottom,
              left: (barWidth - FAB_SIZE) / 2,
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.20)",
            },
          ]}
          onPress={handleAddCampaign}
          accessibilityRole="button"
          accessibilityLabel="Add Campaign"
        >
          <Ionicons name="add" size={28} color={c.green} />
        </Pressable>
      </View>
    </View>
  );
}

export default function OrgTabsLayout() {
  const c = useThemeColors();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader
        variant="org"
        title="Dashboard"
        showSearch={false}
        showNotifications
      />
      <Tabs
        tabBar={(props) => <OrgTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="campaigns" />
        <Tabs.Screen name="donations" />
        <Tabs.Screen name="subscriptions" options={{ href: null }} />
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
  barContainer: {
    alignItems: "center",
  },
  tabBarInner: {
    flexDirection: "row",
    height: BAR_H,
    borderRadius: 28,
    alignItems: "center",
    paddingHorizontal: BAR_PAD,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
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
    top: BAR_PAD - 2,
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
  fab: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    ...Platform.select({
      web: { boxShadow: "0 4px 16px rgba(0,0,0,0.32)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.40,
        shadowRadius: 10,
        elevation: 14,
      },
    }),
  },
});
