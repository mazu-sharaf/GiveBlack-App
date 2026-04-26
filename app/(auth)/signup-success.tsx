import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Share,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useLocalSearchParams } from "expo-router";
import { navigateAfterAuth } from "@/lib/auth-navigation";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";

function parseDonationContext(returnTo?: string): { orgId: string; amount: number } | null {
  if (!returnTo) return null;
  const match = returnTo.match(/^\/donate\/([^?/]+)/);
  if (!match) return null;
  const orgId = match[1];
  const search = returnTo.includes("?") ? returnTo.split("?")[1] : "";
  const urlParams = new URLSearchParams(search);
  const amountStr = urlParams.get("amount");
  if (!amountStr) return null;
  const amount = parseFloat(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { orgId, amount };
}

const WELCOME_SEEN_KEY = "@gb_welcome_seen";

const INVITE_MESSAGE =
  "I just joined GiveBlack — a platform that connects donors with Black-led causes and community programs. Come support with me! https://giveblackapp.com";

const ACTIONS = [
  {
    icon: "business-outline",
    title: "Browse Organizations",
    subtitle: "Discover Black-led nonprofits and causes",
    href: "/categories" as const,
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
  const { organizations } = useApp();
  const params = useLocalSearchParams<{ name?: string; email?: string; returnTo?: string }>();
  const returnTo = params.returnTo ? String(params.returnTo) : undefined;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  const firstName = params.name ? params.name.split(" ")[0] : null;

  const donationCtx = parseDonationContext(returnTo);
  const donationOrg = donationCtx ? organizations.find((o) => o.id === donationCtx.orgId) : null;

  useEffect(() => {
    const email = params.email;
    if (!email) return;
    const key = `${WELCOME_SEEN_KEY}_${email}`;
    AsyncStorage.getItem(key).then((seen) => {
      if (seen) {
        navigateAfterAuth("donor", returnTo);
      } else {
        AsyncStorage.setItem(key, "1").catch(() => {});
      }
    }).catch(() => {});
  }, [params.email]);

  async function handleAction(href: string | null) {
    if (href === null) {
      try {
        await Share.share({ message: INVITE_MESSAGE });
      } catch {
        // user cancelled or share not available
      }
      return;
    }
    router.replace(href as any);
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

      {donationCtx && donationOrg && (
        <View style={[styles.donateBanner, { backgroundColor: c.green + "14", borderColor: c.green + "40" }]}>
          <Ionicons name="heart" size={16} color={c.green} style={{ marginRight: 10, flexShrink: 0 }} />
          <Text style={[styles.donateBannerText, { color: c.text }]}>
            {"You're donating "}
            <Text style={{ fontFamily: "SpaceGrotesk_700Bold", color: c.green }}>${donationCtx.amount % 1 === 0 ? donationCtx.amount.toFixed(0) : donationCtx.amount.toFixed(2)}</Text>
            {" to "}
            <Text style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}>{donationOrg.name}</Text>
          </Text>
        </View>
      )}

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
        style={[styles.skipBtn, { borderColor: returnTo ? c.green : c.border }]}
        onPress={() => navigateAfterAuth("donor", returnTo)}
      >
        <Text style={[styles.skipBtnText, { color: returnTo ? c.green : c.textMuted }]}>
          {returnTo ? "Continue to Donate" : "Enter the app"}
        </Text>
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
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 28,
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
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
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  actionSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
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
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  donateBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    width: "100%",
  },
  donateBannerText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
