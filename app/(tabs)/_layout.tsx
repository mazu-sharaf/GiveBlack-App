import React from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  { name: "favourite",  title: "Favorites",  icon: "heart-outline",     iconFilled: "heart"     },
  { name: "account",    title: "Account",    icon: "person-outline",    iconFilled: "person"    },
];

const BAR_COLOR = "#1C1C1E";
const BAR_H     = 62;

function SimpleTabBar({ state, navigation }: any) {
  const c      = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const barWidth   = Math.min(screenWidth - 32, 420);
  const activeName = state.routes[state.index]?.name ?? "";

  const getRoute = (name: string) => state.routes.find((r: any) => r.name === name) ?? null;

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
      <View style={[styles.bar, { width: barWidth, backgroundColor: BAR_COLOR }]}>
        {TABS.map((tab) => {
          const route   = getRoute(tab.name);
          if (!route) return null;
          const focused = activeName === tab.name;
          const color   = focused ? c.green : "rgba(255,255,255,0.42)";

          return (
            <Pressable
              key={tab.name}
              style={styles.tabBtn}
              onPress={() => {
                const ev = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !ev.defaultPrevented) navigation.navigate(route.name);
              }}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.title}
            >
              <Ionicons
                name={focused ? tab.iconFilled : tab.icon}
                size={22}
                color={color}
              />
              <Text style={[styles.label, { color }]}>{tab.title}</Text>
              <View style={[styles.dot, { backgroundColor: focused ? c.green : "transparent" }]} />
            </Pressable>
          );
        })}
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
        tabBar={(props) => <SimpleTabBar {...props} />}
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
  outer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    height: BAR_H,
    borderRadius: BAR_H / 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
    overflow: "hidden",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
  },
  label: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk_600SemiBold",
    letterSpacing: 0.1,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
