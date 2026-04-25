import React, { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
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
  { name: "index",      title: "Home",       icon: "home-outline",      iconFilled: "home"      },
  { name: "community",  title: "Campaigns",  icon: "megaphone-outline", iconFilled: "megaphone" },
  { name: "categories", title: "Categories", icon: "grid-outline",      iconFilled: "grid"      },
  { name: "account",    title: "Account",    icon: "person-outline",    iconFilled: "person"    },
];

const FLOAT_ABOVE  = 14;
const BUBBLE_SIZE  = 52;
const BUBBLE_R     = BUBBLE_SIZE / 2;
const SPACE_ABOVE  = FLOAT_ABOVE + BUBBLE_R;
const BAR_H        = 62;
const BAR_R        = BAR_H / 2;
const TOTAL_H      = SPACE_ABOVE + BAR_H;
const ICON_SIZE    = 22;
const LABEL_H      = 12;
const GROUP_H      = ICON_SIZE + 4 + LABEL_H;
const ICON_TOP     = SPACE_ABOVE + Math.round((BAR_H - GROUP_H) / 2);
const LABEL_TOP    = ICON_TOP + ICON_SIZE + 4;
const ICON_CENTER  = ICON_TOP + ICON_SIZE / 2;
const LIFT_DELTA   = ICON_CENTER - BUBBLE_R;

const SPRING    = { damping: 15, stiffness: 220 };
const BAR_COLOR = "#1C1C1E";

function FloatingTabItem({
  tab,
  focused,
  green,
  onPress,
  onLongPress,
}: {
  tab: TabDef;
  focused: boolean;
  green: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const lift = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused, lift]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: lift.value,
    transform: [{ scale: 0.72 + 0.28 * lift.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * LIFT_DELTA }],
  }));

  const activeColor  = focused ? green : "rgba(255,255,255,0.42)";
  const iconColor    = focused ? green : "rgba(255,255,255,0.42)";

  return (
    <Pressable
      style={styles.tabBtn}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.title}
    >
      <Animated.View style={[styles.bubble, bubbleStyle]} />

      <Animated.View style={[styles.iconPos, iconStyle]}>
        <Ionicons
          name={focused ? tab.iconFilled : tab.icon}
          size={ICON_SIZE}
          color={iconColor}
        />
      </Animated.View>

      <Text style={[styles.tabLabel, { color: activeColor }]}>
        {tab.title}
      </Text>
    </Pressable>
  );
}

function FloatingTabBar({ state, navigation }: any) {
  const c      = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const barWidth   = Math.min(screenWidth - 32, 420);
  const activeName = state.routes[state.index]?.name ?? "";

  const getRoute     = (name: string) => state.routes.find((r: any) => r.name === name) ?? null;
  const makeHandlers = (route: any, focused: boolean) => ({
    onPress: () => {
      const ev = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !ev.defaultPrevented) navigation.navigate(route.name);
    },
    onLongPress: () => navigation.emit({ type: "tabLongPress", target: route.key }),
  });

  return (
    <View style={[styles.barOuter, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
      <View style={{ width: barWidth, height: TOTAL_H }}>
        <View style={[styles.bar, { backgroundColor: BAR_COLOR }]} />

        <View style={styles.tabsRow}>
          {TABS.map((tab) => {
            const route = getRoute(tab.name);
            if (!route) return null;
            const focused = activeName === tab.name;
            return (
              <FloatingTabItem
                key={tab.name}
                tab={tab}
                focused={focused}
                green={c.green}
                {...makeHandlers(route, focused)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const c = useThemeColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader variant="donor" />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
        ))}
        <Tabs.Screen name="favourite" options={{ title: "Favorites", href: null }} />
        <Tabs.Screen name="give"      options={{ title: "Donate",    href: null }} />
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
  bar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: BAR_H,
    borderRadius: BAR_R,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  tabsRow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
  },
  tabBtn: {
    flex: 1,
    height: TOTAL_H,
    alignItems: "center",
  },
  bubble: {
    position: "absolute",
    top: 0,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_R,
    backgroundColor: BAR_COLOR,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 12,
  },
  iconPos: {
    position: "absolute",
    top: ICON_TOP,
  },
  tabLabel: {
    position: "absolute",
    top: LABEL_TOP,
    fontSize: 10,
    fontFamily: "SpaceGrotesk_600SemiBold",
    letterSpacing: 0.1,
  },
});
