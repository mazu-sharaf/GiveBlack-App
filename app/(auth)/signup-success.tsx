import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Share,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { useLocalSearchParams } from "expo-router";
import { navigateAfterAuth } from "@/lib/auth-navigation";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";

const INVITE_MESSAGE =
  "I just joined GiveBlack — a platform that connects donors with Black-led causes and community programs. Come support with me! https://giveblackapp.com";

const ACTIONS = [
  {
    icon: "business-outline",
    title: "Browse Organizations",
    subtitle: "Discover Black-led nonprofits and causes",
    href: "/(tabs)/categories" as const,
  },
  {
    icon: "heart-outline",
    title: "Make a Donation",
    subtitle: "Support a campaign and make an impact",
    href: "/(tabs)" as const,
  },
  {
    icon: "people-outline",
    title: "Invite Friends",
    subtitle: "Share GiveBlack with people you care about",
    href: null as null,
  },
] as const;

export default function SignupSuccessScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const params = useLocalSearchParams<{ name?: string }>();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  const firstName = params.name ? params.name.split(" ")[0] : null;

  async function handleAction(href: string | null) {
    if (href === null) {
      try {
        await Share.share({ message: INVITE_MESSAGE });
      } catch {
        // user cancelled or share not available
      }
      return;
    }
    navigateAfterAuth("donor");
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.background, paddingTop: topPad + 40, paddingBottom: bottomPad + 24 },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: Colors.green }]}>
        <Ionicons name="checkmark" size={44} color={Colors.white} />
      </View>

      <Text style={[styles.heading, { color: c.text }]}>
        {firstName ? `Welcome, ${firstName}!` : "Welcome!"}
      </Text>
      <Text style={[styles.subtitle, { color: c.textMuted }]}>
        Your account is ready. Here are a few ways to get started.
      </Text>

      <View style={styles.actions}>
        {ACTIONS.map((action) => (
          <Pressable
            key={action.title}
            style={[styles.actionCard, { backgroundColor: c.cardBg }]}
            onPress={() => handleAction(action.href)}
          >
            <View style={[styles.actionIcon, { backgroundColor: c.background }]}>
              <Ionicons name={action.icon as any} size={22} color={Colors.green} />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: c.text }]}>{action.title}</Text>
              <Text style={[styles.actionSubtitle, { color: c.textMuted }]}>{action.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textLight} />
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      <Pressable
        style={[styles.skipBtn, { borderColor: c.border }]}
        onPress={() => navigateAfterAuth("donor")}
      >
        <Text style={[styles.skipBtnText, { color: c.textMuted }]}>Enter the app</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  heading: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 36,
    paddingHorizontal: 10,
  },
  actions: {
    width: "100%",
    gap: 12,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  actionSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  skipBtn: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
  },
  skipBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
});
