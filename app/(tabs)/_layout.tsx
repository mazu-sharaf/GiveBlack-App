import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import AppHeader from "@/components/AppHeader";

interface TabDef {
  name: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
}

const TABS: TabDef[] = [
  { name: "index", title: "Home", icon: "home-outline", iconFilled: "home" },
  { name: "community", title: "Community", icon: "people-outline", iconFilled: "people" },
  { name: "favourite", title: "Favorites", icon: "heart-outline", iconFilled: "heart" },
  { name: "categories", title: "Categories", icon: "grid-outline", iconFilled: "grid" },
  { name: "account", title: "Account", icon: "person-outline", iconFilled: "person" },
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
const PILL_RADIUS = 24;
const BAR_H_PADDING = 6;
const ICON_SIZE = 22;
const FAB_SIZE = 62;

function LiquidGlassTabBar({ state, descriptors, navigation }: any) {
  const { isDark } = useTheme();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { user } = useAuth();

  const isCharity = user?.type === "charity";

  const barWidth = Math.min(screenWidth - 32, 400);
  const tabWidth = (barWidth - BAR_H_PADDING * 2) / TAB_COUNT;
  const pillWidth = tabWidth - 4;

  const activeTabIndex = TABS.findIndex((t) => t.name === state.routes[state.index]?.name);
  const safeActiveIndex = activeTabIndex >= 0 ? activeTabIndex : 0;

  const translateX = useSharedValue(safeActiveIndex * tabWidth + BAR_H_PADDING + 2);
  const activeIndex = useSharedValue(safeActiveIndex);

  const fabScale = useSharedValue(1);

  useEffect(() => {
    if (activeTabIndex < 0) {
      activeIndex.value = withSpring(-5, SPRING_CONFIG);
      return;
    }
    const target = activeTabIndex * tabWidth + BAR_H_PADDING + 2;
    translateX.value = withSpring(target, SPRING_CONFIG);
    activeIndex.value = withSpring(activeTabIndex, SPRING_CONFIG);
  }, [state.index, tabWidth, activeTabIndex]);

  const pillAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      width: pillWidth,
    };
  });

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const handleFabPressIn = useCallback(() => {
    fabScale.value = withSpring(0.88, { damping: 15, stiffness: 300 });
  }, []);

  const handleFabPressOut = useCallback(() => {
    fabScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, []);

  const handleDonatePres = useCallback(() => {
    navigation.navigate("give");
  }, [navigation]);

  const isGiveActive = state.routes[state.index]?.name === "give";

  return (
    <View
      style={[
        styles.barOuter,
        { paddingBottom: Math.max(insets.bottom, 8) + 4 },
      ]}
    >
      {!isCharity && (
        <Pressable
          onPress={handleDonatePres}
          onPressIn={handleFabPressIn}
          onPressOut={handleFabPressOut}
          accessibilityRole="button"
          accessibilityLabel="Donate"
          style={styles.fabWrapper}
        >
          <Animated.View
            style={[
              styles.fabCircle,
              {
                backgroundColor: c.green,
                shadowColor: c.green,
              },
              fabAnimatedStyle,
              isGiveActive && styles.fabCircleActive,
            ]}
          >
            <Ionicons name="heart" size={26} color="#fff" />
          </Animated.View>
          <Text style={[styles.fabLabel, { color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)" }]}>
            Donate
          </Text>
        </Pressable>
      )}

      <View
        style={[
          styles.glassContainer,
          {
            width: barWidth,
            backgroundColor: isDark
              ? "rgba(40, 40, 40, 0.65)"
              : "rgba(255, 255, 255, 0.55)",
            borderColor: isDark
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(255, 255, 255, 0.7)",
            boxShadow: isDark
              ? "0px 8px 24px rgba(0, 0, 0, 0.5)"
              : "0px 8px 24px rgba(0, 0, 0, 0.12)",
          },
        ]}
      >
        <BlurView
          intensity={Platform.OS === "web" ? 60 : 80}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />

        {activeTabIndex >= 0 && (
          <Animated.View style={[styles.pillIndicator, pillAnimatedStyle, {
            backgroundColor: isDark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(0, 0, 0, 0.06)",
            borderColor: isDark
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(255, 255, 255, 0.9)",
          }]} />
        )}

        <View style={[styles.barInner, { paddingHorizontal: BAR_H_PADDING }]}>
          {state.routes.map((route: any, index: number) => {
            const tab = TABS.find((t) => t.name === route.name);
            if (!tab) return null;
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label = options.title || tab.title;

            const tabIndexInArray = TABS.findIndex((t) => t.name === route.name);

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            return (
              <TabItem
                key={route.key}
                index={tabIndexInArray}
                activeIndex={activeIndex}
                icon={tab.icon}
                iconFilled={tab.iconFilled}
                label={label}
                focused={focused}
                isDark={isDark}
                activeColor={c.green}
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityLabel={options.tabBarAccessibilityLabel || label}
                testID={options.tabBarTestID}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabItem({
  index,
  activeIndex,
  icon,
  iconFilled,
  label,
  focused,
  isDark,
  activeColor,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: {
  index: number;
  activeIndex: Animated.SharedValue<number>;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
  isDark: boolean;
  activeColor: string;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const scaleAnim = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scaleAnim.value = withSpring(0.85, { damping: 15, stiffness: 300 });
  }, []);

  const handlePressOut = useCallback(() => {
    scaleAnim.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, []);

  const containerStyle = useAnimatedStyle(() => {
    const distance = Math.abs(activeIndex.value - index);
    const iconScale = interpolate(
      distance,
      [0, 1, 2],
      [1.15, 1, 0.95],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { scale: scaleAnim.value * iconScale },
      ],
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    const distance = Math.abs(activeIndex.value - index);
    const opacity = interpolate(
      distance,
      [0, 0.5, 1],
      [1, 0.5, 0],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      distance,
      [0, 1],
      [0, 6],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const iconColor = focused
    ? activeColor
    : isDark
    ? "rgba(255, 255, 255, 0.5)"
    : "rgba(0, 0, 0, 0.4)";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.tabContent, containerStyle]}>
        <Ionicons
          name={focused ? iconFilled : icon}
          size={ICON_SIZE}
          color={iconColor}
        />
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: activeColor },
            labelStyle,
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const c = useThemeColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader variant="donor" />
      <Tabs
        tabBar={(props) => <LiquidGlassTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
        ))}
        <Tabs.Screen name="give" options={{ title: "Donate", href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  barOuter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fabWrapper: {
    alignItems: "center",
    marginBottom: 6,
  },
  fabCircle: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 14,
  },
  fabCircleActive: {
    opacity: 0.85,
  },
  fabLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
    letterSpacing: 0.2,
  },
  glassContainer: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    elevation: 20,
  },
  pillIndicator: {
    position: "absolute",
    top: 4,
    height: PILL_H,
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    zIndex: 0,
  },
  barInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: PILL_H + 8,
    zIndex: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: PILL_H,
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
  },
});
