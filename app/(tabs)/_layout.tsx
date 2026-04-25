import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
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

const LEFT_TABS: TabDef[] = [
  { name: "index",     title: "Home",      icon: "home-outline",   iconFilled: "home"   },
  { name: "community", title: "Community", icon: "people-outline", iconFilled: "people" },
];

const RIGHT_TABS: TabDef[] = [
  { name: "favourite", title: "Favorites", icon: "heart-outline",  iconFilled: "heart"  },
  { name: "account",   title: "Account",   icon: "person-outline", iconFilled: "person" },
];

const ALL_TABS: TabDef[] = [...LEFT_TABS, ...RIGHT_TABS];

const BAR_H      = 66;
const BAR_R      = BAR_H / 2;
const FAB_SIZE   = 64;
const FAB_R      = FAB_SIZE / 2;
const NOTCH_R    = 40;
const FAB_ABOVE  = 14;
const SPACE_ABOVE = FAB_R + FAB_ABOVE;
const NOTCH_HW   = Math.round(Math.sqrt(NOTCH_R ** 2 - FAB_ABOVE ** 2));
const ICON_SIZE  = 22;
const BAR_COLOR  = "#1C1C1E";
const FAB_SPRING = { damping: 15, stiffness: 300 };

function buildNotchPath(W: number): string {
  const H = BAR_H, R = BAR_R, cx = W / 2, nhw = NOTCH_HW, nr = NOTCH_R;
  return (
    `M ${R} 0 ` +
    `L ${cx - nhw} 0 ` +
    `A ${nr} ${nr} 0 0 1 ${cx + nhw} 0 ` +
    `L ${W - R} 0 ` +
    `A ${R} ${R} 0 0 1 ${W} ${R} ` +
    `L ${W} ${H - R} ` +
    `A ${R} ${R} 0 0 1 ${W - R} ${H} ` +
    `L ${R} ${H} ` +
    `A ${R} ${R} 0 0 1 0 ${H - R} ` +
    `L 0 ${R} ` +
    `A ${R} ${R} 0 0 1 ${R} 0 Z`
  );
}

function buildFlatPath(W: number): string {
  const H = BAR_H, R = BAR_R;
  return (
    `M ${R} 0 ` +
    `L ${W - R} 0 ` +
    `A ${R} ${R} 0 0 1 ${W} ${R} ` +
    `L ${W} ${H - R} ` +
    `A ${R} ${R} 0 0 1 ${W - R} ${H} ` +
    `L ${R} ${H} ` +
    `A ${R} ${R} 0 0 1 0 ${H - R} ` +
    `L 0 ${R} ` +
    `A ${R} ${R} 0 0 1 ${R} 0 Z`
  );
}

function TabItem({
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
  const color = focused ? green : "rgba(255,255,255,0.45)";

  return (
    <Pressable
      style={styles.tabBtn}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.title}
    >
      <View style={styles.tabContent}>
        <Ionicons name={focused ? tab.iconFilled : tab.icon} size={ICON_SIZE} color={color} />
        <Text style={[styles.tabLabel, { color }]}>{tab.title}</Text>
      </View>
    </Pressable>
  );
}

function NotchTabBar({ state, descriptors, navigation }: any) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { user } = useAuth();

  const isCharity  = user?.type === "charity";
  const barWidth   = Math.min(screenWidth - 32, 420);
  const cx         = barWidth / 2;
  const sideWidth  = cx - NOTCH_HW - 4;
  const barPath    = isCharity ? buildFlatPath(barWidth) : buildNotchPath(barWidth);
  const activeName = state.routes[state.index]?.name ?? "";
  const isGiveActive = activeName === "give";

  const fabScale     = useSharedValue(1);
  const fabAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabScale.value }] }));

  const handleFabPressIn  = useCallback(() => { fabScale.value = withSpring(0.88, FAB_SPRING); }, [fabScale]);
  const handleFabPressOut = useCallback(() => { fabScale.value = withSpring(1, FAB_SPRING);    }, [fabScale]);
  const handleFabPress    = useCallback(() => { navigation.navigate("give"); },                    [navigation]);

  const getRoute     = (name: string) => state.routes.find((r: any) => r.name === name) ?? null;
  const makeHandlers = (route: any, focused: boolean) => ({
    onPress: () => {
      const ev = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !ev.defaultPrevented) navigation.navigate(route.name);
    },
    onLongPress: () => navigation.emit({ type: "tabLongPress", target: route.key }),
  });

  if (isCharity) {
    return (
      <View style={[styles.barOuter, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
        <View style={{ width: barWidth, height: BAR_H }}>
          <Svg width={barWidth} height={BAR_H} style={StyleSheet.absoluteFill}>
            <Path d={barPath} fill={BAR_COLOR} />
          </Svg>
          <View style={styles.flatTabRow}>
            {ALL_TABS.map((tab) => {
              const route = getRoute(tab.name);
              if (!route) return null;
              const focused = activeName === tab.name;
              return (
                <TabItem
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

  return (
    <View style={[styles.barOuter, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
      <View style={{ width: barWidth, height: SPACE_ABOVE + BAR_H }}>

        <Svg width={barWidth} height={BAR_H} style={styles.barSvg}>
          <Path d={barPath} fill={BAR_COLOR} />
        </Svg>

        <View style={[styles.tabSide, { left: 0, width: sideWidth }]}>
          {LEFT_TABS.map((tab) => {
            const route = getRoute(tab.name);
            if (!route) return null;
            const focused = activeName === tab.name;
            return <TabItem key={tab.name} tab={tab} focused={focused} green={c.green} {...makeHandlers(route, focused)} />;
          })}
        </View>

        <View style={[styles.tabSide, { right: 0, width: sideWidth }]}>
          {RIGHT_TABS.map((tab) => {
            const route = getRoute(tab.name);
            if (!route) return null;
            const focused = activeName === tab.name;
            return <TabItem key={tab.name} tab={tab} focused={focused} green={c.green} {...makeHandlers(route, focused)} />;
          })}
        </View>

        <Pressable
          onPress={handleFabPress}
          onPressIn={handleFabPressIn}
          onPressOut={handleFabPressOut}
          accessibilityRole="button"
          accessibilityLabel="Donate"
          style={[styles.fabPressable, { left: cx - FAB_R, top: 0 }]}
        >
          <Animated.View
            style={[
              styles.fabCircle,
              isGiveActive && styles.fabActive,
              fabAnimStyle,
            ]}
          >
            <Ionicons name="heart" size={26} color={c.green} />
          </Animated.View>
        </Pressable>
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
        tabBar={(props) => <NotchTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        {ALL_TABS.map((tab) => (
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
  barSvg: {
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  flatTabRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: BAR_H,
    flexDirection: "row",
    alignItems: "center",
  },
  tabSide: {
    position: "absolute",
    bottom: 0,
    height: BAR_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 2,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: BAR_H,
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_600SemiBold",
    letterSpacing: 0.1,
  },
  fabPressable: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    zIndex: 10,
  },
  fabCircle: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_R,
    backgroundColor: BAR_COLOR,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 12,
  },
  fabActive: {
    opacity: 0.75,
  },
});
