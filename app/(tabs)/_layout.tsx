import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/context/AuthContext";
import { loadDonationIntent } from "@/lib/donation-intent";

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
const FAB_SIZE  = 56;
const FAB_RISE  = 18;

function SimpleTabBar({ state, navigation }: any) {
  const c      = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { isGuest, pendingDonationCount, refreshPendingDonationCount } = useAuth();

  const [guestPending, setGuestPending] = useState(false);

  useEffect(() => {
    if (!isGuest) {
      setGuestPending(false);
      return;
    }
    let cancelled = false;
    void loadDonationIntent().then((intent) => {
      if (!cancelled) setGuestPending(intent !== null);
    });
    return () => { cancelled = true; };
  }, [isGuest, state.index]);

  useEffect(() => {
    void refreshPendingDonationCount();
  }, [state.index, refreshPendingDonationCount]);

  const badgeCount = isGuest ? (guestPending ? 1 : 0) : pendingDonationCount;

  const barWidth   = Math.min(screenWidth - 32, 420);
  const activeName = state.routes[state.index]?.name ?? "";

  const getRoute = (name: string) => state.routes.find((r: any) => r.name === name) ?? null;

  const handleDonatePress = () => {
    navigation.navigate("give");
  };

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
      <View style={[styles.barContainer, { width: barWidth }]}>
        <View style={[styles.bar, { backgroundColor: BAR_COLOR }]}>
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

        <Pressable
          style={[
            styles.fab,
            {
              backgroundColor: c.green,
              bottom: (BAR_H / 2) + FAB_RISE - FAB_SIZE / 2,
            },
          ]}
          onPress={handleDonatePress}
          accessibilityRole="button"
          accessibilityLabel="Donate"
        >
          <Ionicons name="heart" size={24} color="#FFFFFF" />
          {badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {badgeCount > 9 ? "9+" : String(badgeCount)}
              </Text>
            </View>
          )}
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
  barContainer: {
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    width: "100%",
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
  fab: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 14,
    borderWidth: 3,
    borderColor: BAR_COLOR,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: BAR_COLOR,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "SpaceGrotesk_600SemiBold",
    lineHeight: 12,
  },
});
