import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useThemeColors } from "@/context/ThemeContext";
import { apiPost, getApiUrl } from "@/lib/query-client";
import { isNativeStripeAvailable, presentNativePaymentSheet } from "@/lib/stripe-confirm";

const FREE_FEATURES = [
  { icon: "megaphone-outline" as const, text: "1 community campaign" },
  { icon: "cash-outline" as const, text: "Up to $5,000 goal per campaign" },
  { icon: "time-outline" as const, text: "14-day payout hold before funds transfer" },
  { icon: "help-circle-outline" as const, text: "Standard support" },
];

const GROWTH_FEATURES = [
  { icon: "megaphone-outline" as const, text: "5 community campaigns" },
  { icon: "cash-outline" as const, text: "Up to $50,000 goal per campaign" },
  { icon: "time-outline" as const, text: "7-day payout hold before funds transfer" },
  { icon: "hand-left-outline" as const, text: "Volunteer signup" },
  { icon: "checkmark-done-outline" as const, text: "Everything in Free" },
  { icon: "headset-outline" as const, text: "Priority support" },
];

const INSTITUTIONAL_FEATURES = [
  { icon: "megaphone-outline" as const, text: "Unlimited community campaigns" },
  { icon: "cash-outline" as const, text: "Unlimited goal per campaign" },
  { icon: "time-outline" as const, text: "7-day payout hold before funds transfer" },
  { icon: "hand-left-outline" as const, text: "Volunteer signup" },
  { icon: "checkmark-done-outline" as const, text: "Everything in Growth" },
  { icon: "person-outline" as const, text: "Dedicated support" },
];

function daysUntil(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function formatExpiry(endDate: string | null): string {
  if (!endDate) return "—";
  return new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function normalizeSubscriptionError(message?: string): string {
  if (!message) return "Could not start checkout. Please try again.";
  const m = message.toLowerCase();
  if (
    m.includes("no such customer") ||
    m.includes("test mode key was used") ||
    m.includes("live mode key was used")
  ) {
    return "Stripe customer data is out of sync for this account. Please try again; a new customer profile will be created automatically.";
  }
  return message;
}

export default function CharityPlanScreen() {
  const { user, session } = useAuth();
  const c = useThemeColors();
  const insets = useSafeInsets();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("free");
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [limits, setLimits] = useState<{ max_community_campaigns: number; max_goal_per_campaign: number } | null>(null);
  const [communityCampaignCount, setCommunityCampaignCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const apiBase = getApiUrl().replace(/\/$/, "");

  const loadSubscription = useCallback(async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
      const res = await fetch(`${apiBase}/api/charity/my-subscription`, { headers });
      let data = await res.json();
      const sub = data.subscription;
      const needsProactiveSync =
        data.org_id &&
        session?.accessToken &&
        (sub?.status === "incomplete" ||
          (data.stripe_subscription_id &&
            sub?.tier === "free" &&
            (sub?.status === "past_due" ||
              sub?.status === "unpaid" ||
              sub?.status === "active" ||
              sub?.status === "trialing")));
      if (needsProactiveSync) {
        try {
          await apiPost("/api/subscriptions/sync-native", { org_id: data.org_id }, session.accessToken);
          const res2 = await fetch(`${apiBase}/api/charity/my-subscription`, { headers });
          if (res2.ok) data = await res2.json();
        } catch {
          // Webhooks or pull-to-refresh will update later.
        }
      }
      setOrgId(data.org_id || null);
      setTier(data.subscription?.tier || "free");
      setPeriodEnd(data.subscription?.current_period_end || null);
      setLimits(data.subscription?.limits || null);
      setCommunityCampaignCount(data.community_campaign_count ?? null);
    } catch {
      setTier("free");
    } finally {
      setLoading(false);
    }
  }, [apiBase, session?.accessToken, user?.email]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const handleSubscribe = async (planTier: "growth" | "institutional") => {
    if (!orgId) {
      Alert.alert("Organization required", "Your organization must be set up before you can subscribe. Complete your profile in Settings or contact support.");
      return;
    }
    if (!session?.accessToken) {
      Alert.alert("Sign in required", "Your session is missing or expired. Please sign in again and retry.");
      return;
    }
    setUpgrading(planTier);
    try {
      const nativeAvailable = await isNativeStripeAvailable();
      if (!nativeAvailable || Platform.OS === "web") {
        Alert.alert("Native payments unavailable", "Please use an iOS/Android build with Stripe native module enabled.");
        return;
      }
      const data = await apiPost<any>(
        "/api/subscriptions/create-native-intent",
        { org_id: orgId, tier: planTier },
        session.accessToken
      );
      if (!data?.requiresPayment) {
        await apiPost(
          "/api/subscriptions/sync-native",
          { org_id: orgId, subscription_id: data.subscriptionId },
          session.accessToken
        );
        await loadSubscription();
        Alert.alert("Plan updated", "Your plan is active and features are now unlocked.");
        return;
      }
      const payResult = await presentNativePaymentSheet({
        clientSecret: data.clientSecret,
        setupIntentClientSecret: data.setupIntentClientSecret,
        customerId: data.customerId,
        ephemeralKey: data.ephemeralKey,
        merchantName: "GiveBlack",
        allowsDelayedPaymentMethods: false,
      });
      if (payResult.status === "success") {
        await apiPost(
          "/api/subscriptions/sync-native",
          { org_id: orgId, subscription_id: data.subscriptionId },
          session.accessToken
        );
        await loadSubscription();
        Alert.alert("Subscription active", `Your ${planTier} plan is now active.`);
      } else if (payResult.status === "canceled") {
        Alert.alert("Payment canceled", "Subscription change was canceled.");
      } else {
        Alert.alert("Payment failed", normalizeSubscriptionError(payResult.message));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not start checkout. Please try again.";
      Alert.alert("Error", normalizeSubscriptionError(msg));
    } finally {
      setUpgrading(null);
    }
  };

  const handleManageBilling = async () => {
    if (!orgId) {
      Alert.alert("Organization required", "Your organization must be set up before managing billing.");
      return;
    }
    if (!session?.accessToken) {
      Alert.alert("Sign in required", "Your session is missing or expired. Please sign in again and retry.");
      return;
    }
    setUpgrading("portal");
    try {
      const data = await apiPost<any>(
        "/api/subscriptions/create-portal-session",
        { org_id: orgId },
        session.accessToken
      );
      if (data?.url) await Linking.openURL(data.url);
      else Alert.alert("Unable to open billing", "Please try again later.");
    } catch {
      Alert.alert("Error", "Could not open billing. Please try again.");
    } finally {
      setUpgrading(null);
    }
  };

  const remainingDays = daysUntil(periodEnd);
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.green} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.heroTitle, { color: c.text }]}>Unlock more for your organization</Text>
      <Text style={[styles.heroSubtitle, { color: c.textMuted }]}>Higher plans allow more community campaigns and higher goals per campaign. Billed securely via Stripe.</Text>

      {/* Current plan & expiry */}
      <View style={[styles.currentCard, { backgroundColor: c.cardBg }]}>
        <View style={styles.currentRow}>
          <View>
            <Text style={[styles.currentLabel, { color: c.textMuted }]}>Current plan</Text>
            <Text style={[styles.currentPlanName, { color: c.green }]}>{tier === "free" ? "Free" : tier === "growth" ? "Growth" : "Institutional"}</Text>
          </View>
          {tier !== "free" && periodEnd && (
            <View style={[styles.expiryBadge, { backgroundColor: c.green + "20" }]}>
              <Text style={[styles.expiryDays, { color: c.green }]}>{remainingDays !== null ? `${remainingDays} days left` : "Expired"}</Text>
              <Text style={[styles.expiryDate, { color: c.textMuted }]}>Renews {formatExpiry(periodEnd)}</Text>
            </View>
          )}
        </View>
        {tier !== "free" && orgId && (
          <Pressable style={[styles.manageBillingBtn, { borderColor: c.green }]} onPress={handleManageBilling} disabled={!!upgrading}>
            <Ionicons name="card-outline" size={18} color={c.green} />
            <Text style={[styles.manageBillingText, { color: c.green }]}>{upgrading === "portal" ? "Opening…" : "Manage billing (Stripe)"}</Text>
          </Pressable>
        )}
        {tier === "free" && (
          <>
            <Text style={[styles.freeLimits, { color: c.textMuted }]}>
              1 community campaign · Up to $5,000 goal per campaign · 14-day payout hold · Standard support
            </Text>
            {communityCampaignCount !== null && limits && (
              <Text style={[styles.usageText, { color: c.green }]}>{communityCampaignCount}/{limits.max_community_campaigns} campaigns used</Text>
            )}
          </>
        )}
        {tier !== "free" && communityCampaignCount !== null && limits && (
          <Text style={[styles.usageText, { color: c.textMuted }]}>{communityCampaignCount} of {limits.max_community_campaigns >= 999 ? "unlimited" : limits.max_community_campaigns} campaigns used</Text>
        )}
      </View>

      {/* Growth */}
      <View style={[styles.planSelectable, { backgroundColor: c.cardBg }]}>
        <View style={styles.planSelectableHeader}>
          <View>
            <View style={styles.planTitleRow}>
              <Text style={[styles.planCardTitle, { color: c.text }]}>Growth</Text>
              <View style={[styles.popularBadge, { backgroundColor: c.green }]}>
                <Text style={styles.popularText}>Popular</Text>
              </View>
            </View>
            <View style={styles.priceRow}>
              <Text style={[styles.priceMain, { color: c.text }]}>$99</Text>
              <Text style={[styles.pricePeriod, { color: c.textMuted }]}>/month</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.planDesc, { color: c.textMuted }]}>5 campaigns, up to $50,000 goal each. Everything in Free plus priority support.</Text>
        {GROWTH_FEATURES.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons name={f.icon} size={20} color={c.green} />
            <Text style={[styles.featureText, { color: c.text }]}>{f.text}</Text>
          </View>
        ))}
        {tier !== "growth" && tier !== "institutional" && (
          <Pressable
            style={[styles.planButton, { backgroundColor: c.green }]}
            onPress={() => handleSubscribe("growth")}
            disabled={!!upgrading}
          >
            <Text style={styles.planButtonText}>{upgrading === "growth" ? "Opening checkout…" : "Subscribe — $99/month"}</Text>
          </Pressable>
        )}
      </View>

      {/* Institutional */}
      <View style={[styles.planSelectable, { backgroundColor: c.cardBg }]}>
        <View style={styles.planSelectableHeader}>
          <Text style={[styles.planCardTitle, { color: c.text }]}>Institutional</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={[styles.priceMain, { color: c.text }]}>$249</Text>
          <Text style={[styles.pricePeriod, { color: c.textMuted }]}>/month</Text>
        </View>
        <Text style={[styles.planDesc, { color: c.textMuted }]}>Unlimited campaigns and goal per campaign. Everything in Growth plus dedicated support.</Text>
        {INSTITUTIONAL_FEATURES.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons name={f.icon} size={20} color={c.green} />
            <Text style={[styles.featureText, { color: c.text }]}>{f.text}</Text>
          </View>
        ))}
        {tier !== "institutional" && (
          <Pressable
            style={[styles.planButton, { borderWidth: 2, borderColor: c.green }]}
            onPress={() => handleSubscribe("institutional")}
            disabled={!!upgrading}
          >
            <Text style={[styles.planButtonOutlineText, { color: c.green }]}>{upgrading === "institutional" ? "Opening…" : "Subscribe — $249/month"}</Text>
          </Pressable>
        )}
      </View>

      {!orgId && tier === "free" && (
        <Text style={[styles.orgRequiredNote, { color: c.textMuted }]}>Your organization must be set up before you can subscribe. Complete your profile in Settings or contact support.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heroTitle: { fontSize: 24, fontWeight: "800", marginBottom: 8, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  currentCard: { borderRadius: 16, padding: 18, marginBottom: 20 },
  currentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  currentLabel: { fontSize: 12, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  currentPlanName: { fontSize: 20, fontWeight: "700" },
  expiryBadge: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignItems: "flex-end" },
  expiryDays: { fontSize: 14, fontWeight: "700" },
  expiryDate: { fontSize: 11, marginTop: 2 },
  freeLimits: { fontSize: 13, marginTop: 10 },
  manageBillingBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2, alignSelf: "flex-start" },
  manageBillingText: { fontSize: 14, fontWeight: "600" },
  planSelectable: { borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "transparent" },
  planSelectableHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  planTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  popularBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  popularText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 6 },
  priceMain: { fontSize: 28, fontWeight: "800" },
  pricePeriod: { fontSize: 15, marginLeft: 2 },
  planDesc: { fontSize: 14, marginBottom: 14 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  featureText: { fontSize: 15, flex: 1 },
  planCardTitle: { fontSize: 20, fontWeight: "700" },
  planButton: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  planButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  planButtonOutlineText: { fontWeight: "700", fontSize: 15 },
  usageText: { fontSize: 13, marginTop: 8 },
  orgRequiredNote: { fontSize: 13, lineHeight: 20, marginTop: 4, paddingHorizontal: 4 },
});
