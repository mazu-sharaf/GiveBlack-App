import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiPost, getApiUrl } from "@/lib/query-client";
import { Ionicons } from "@expo/vector-icons";
import { isNativeStripeAvailable, presentNativePaymentSheet } from "@/lib/stripe-confirm";
import * as WebBrowser from "expo-web-browser";

interface SubData {
  org_id: string | null;
  stripe_subscription_id?: string | null;
  subscription: {
    tier: string;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    limits: { max_community_campaigns: number; max_goal_per_campaign: number };
  };
  community_campaign_count: number;
  organization_campaign_count: number;
}

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceNum: 0,
    period: "/month",
    features: [
      "1 community campaign",
      "Up to $5,000 goal per campaign",
      "14-day payout hold before funds transfer",
      "Standard support",
    ],
    accent: Colors.planFreeAccent,
  },
  {
    id: "growth",
    name: "Growth",
    price: "$99",
    priceNum: 99,
    period: "/month",
    features: [
      "5 community campaigns",
      "Up to $50,000 goal per campaign",
      "7-day payout hold before funds transfer",
      "Volunteer signup",
      "Everything in Free",
      "Priority support",
    ],
    accent: Colors.green,
    popular: true,
  },
  {
    id: "institutional",
    name: "Institutional",
    price: "$249",
    priceNum: 249,
    period: "/month",
    features: [
      "Unlimited community campaigns",
      "Unlimited goal per campaign",
      "7-day payout hold before funds transfer",
      "Volunteer signup",
      "Everything in Growth",
      "Dedicated support",
    ],
    accent: Colors.planInstitutionalAccent,
  },
];

const FAQ = [
  {
    q: "What happens when I upgrade?",
    a: "Your new plan takes effect immediately. You'll be charged the prorated amount for the remaining billing period. New limits apply right away.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "Tap 'Cancel Plan' on your current plan card. Your plan will remain active until the end of the current billing period.",
  },
  {
    q: "How do I update my payment method?",
    a: "Tap 'Manage Billing' to access the billing portal where you can add, remove, or change your payment method.",
  },
  {
    q: "What happens to my campaigns if I downgrade?",
    a: "Existing campaigns remain active. You won't be able to create new campaigns above your new plan's limit until existing ones are completed or removed.",
  },
  {
    q: "When do donated funds reach my organization?",
    a: "After a successful card payment, payouts use a short platform hold for compliance and chargeback protection: 7 days on Growth and Institutional, 14 days on Free. After the hold, transfers follow your connected bank / Stripe payout schedule.",
  },
];

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

export default function SubscriptionsTab() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { session } = useAuth();
  const [subData, setSubData] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [summaryPlan, setSummaryPlan] = useState<typeof PLANS[number] | null>(null);

  const base = getApiUrl().replace(/\/$/, "");
  const token = session?.accessToken ?? "";

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/charity/my-subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        let json = await res.json();
        const sub = json.subscription;
        const needsProactiveSync =
          json.org_id &&
          token &&
          (sub?.status === "incomplete" ||
            (json.stripe_subscription_id &&
              sub?.tier === "free" &&
              (sub?.status === "past_due" ||
                sub?.status === "unpaid" ||
                sub?.status === "active" ||
                sub?.status === "trialing")));
        if (needsProactiveSync) {
          try {
            await apiPost("/api/subscriptions/sync-native", { org_id: json.org_id }, token);
            const res2 = await fetch(`${base}/api/charity/my-subscription`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res2.ok) json = await res2.json();
          } catch {
            // Ignore sync errors; the user can pull-to-refresh or webhooks will update later.
          }
        }
        setSubData(json);
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [base, token]);

  useEffect(() => { if (token) loadData(); }, [token]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const currentTier = subData?.subscription.tier || "free";
  const cancelAtPeriodEnd = subData?.subscription.cancel_at_period_end || false;
  const nextBilling = subData?.subscription.current_period_end
    ? new Date(subData.subscription.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  async function startCheckout(tier: "growth" | "institutional") {
    if (busy) return;
    if (!subData?.org_id) {
      Alert.alert("Organization required", "Your organization is not linked yet. Refresh this page or complete your organization setup first.");
      return;
    }
    if (!token) {
      Alert.alert("Sign in required", "Your session is missing or expired. Please sign in again and retry.");
      return;
    }
    setBusy(true);
    try {
      const nativeAvailable = await isNativeStripeAvailable();
      if (!nativeAvailable || Platform.OS === "web") {
        Alert.alert("Native payments unavailable", "Please use an iOS/Android build with Stripe native module enabled.");
        return;
      }
      let json: any;
      try {
        json = await apiPost<any>(
          "/api/subscriptions/create-native-intent",
          { org_id: subData.org_id, tier },
          token
        );
      } catch (e) {
        const err = normalizeSubscriptionError(
          e instanceof Error ? e.message : "Could not start checkout. Please try again."
        );
        Alert.alert("Unable to start checkout", err);
        return;
      }
      if (json?.requiresPayment) {
        const payResult = await presentNativePaymentSheet({
          clientSecret: json.clientSecret,
          setupIntentClientSecret: json.setupIntentClientSecret,
          customerId: json.customerId,
          ephemeralKey: json.ephemeralKey,
          merchantName: "GiveBlack",
          allowsDelayedPaymentMethods: false,
        });
        if (payResult.status === "canceled") {
          Alert.alert("Payment canceled", "Subscription change was canceled.");
          return;
        }
        if (payResult.status !== "success") {
          Alert.alert("Payment failed", normalizeSubscriptionError(payResult.message));
          return;
        }
        await apiPost(
          "/api/subscriptions/sync-native",
          {
            org_id: subData.org_id,
            subscription_id: json.subscriptionId,
          },
          token
        );
      } else if (json?.subscriptionId) {
        await apiPost(
          "/api/subscriptions/sync-native",
          {
            org_id: subData.org_id,
            subscription_id: json.subscriptionId,
          },
          token
        );
      }
      await loadData();
      Alert.alert("Subscription updated", "Your plan is active and features are updated.");
    } catch (e) {
      console.log("Checkout error:", e);
      const msg = e instanceof Error ? e.message : "Could not start checkout. Please try again.";
      Alert.alert("Error", normalizeSubscriptionError(msg));
    } finally {
      setBusy(false);
      setSummaryPlan(null);
    }
  }

  function handleSummaryCheckout() {
    if (!summaryPlan) return;
    if (summaryPlan.id !== "growth" && summaryPlan.id !== "institutional") {
      Alert.alert("Plan not supported", "Please select a paid plan to continue.");
      return;
    }
    void startCheckout(summaryPlan.id);
  }

  async function openBilling() {
    if (!subData?.org_id || busy) return;
    setBusy(true);
    try {
      const json = await apiPost<{ url?: string }>(
        "/api/subscriptions/create-portal-session",
        { org_id: subData.org_id },
        token
      );
      if (json.url) await WebBrowser.openBrowserAsync(json.url);
      loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not open billing.";
      Alert.alert("Unable to open billing", msg);
    } finally { setBusy(false); }
  }

  function handleCancelPlan() {
    Alert.alert(
      "Cancel Plan",
      `Are you sure you want to cancel your ${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} plan? You'll keep access until ${nextBilling || "the end of your billing period"}.`,
      [
        { text: "Keep Plan", style: "cancel" },
        {
          text: "Cancel Plan",
          style: "destructive",
          onPress: async () => {
            if (!subData?.org_id || busy) return;
            setBusy(true);
            try {
              await apiPost(
                "/api/subscriptions/cancel-native",
                { org_id: subData.org_id },
                token
              );
              await loadData();
              Alert.alert("Canceled", "Your plan will remain active until the end of the billing period.");
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Could not cancel plan.";
              Alert.alert("Unable to cancel", msg);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={c.green} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.green} />}
      >
        <Text style={[styles.headerTitle, { color: c.text }]}>Plans</Text>
        <Text style={[styles.headerSubtitle, { color: c.textMuted }]}>
          Choose the right plan for your organization
        </Text>

        <View style={[styles.currentPlanCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <View style={styles.currentPlanRow}>
            <View>
              <Text style={[styles.currentPlanLabel, { color: c.textMuted }]}>Current Plan</Text>
              <Text style={[styles.currentPlanName, { color: c.text }]}>
                {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: cancelAtPeriodEnd ? c.warningAmber + "15" : c.green + "15" }]}>
              <View style={[styles.statusDot, { backgroundColor: cancelAtPeriodEnd ? c.warningAmber : c.green }]} />
              <Text style={[styles.statusPillText, { color: cancelAtPeriodEnd ? c.warningAmber : c.green }]}>
                {cancelAtPeriodEnd ? "Canceling" : (subData?.subscription.status || "active")}
              </Text>
            </View>
          </View>

          {cancelAtPeriodEnd && nextBilling && (
            <View style={[styles.cancelNotice, { backgroundColor: c.cancelPillBg, borderColor: c.cancelPillBorder }]}>
              <Ionicons name="warning-outline" size={16} color={c.warningAmber} />
              <Text style={[styles.cancelNoticeText, { color: c.cancelPillText }]}>
                Your plan will be canceled on {nextBilling}. You&apos;ll retain access until then.
              </Text>
            </View>
          )}

          {nextBilling && !cancelAtPeriodEnd && (
            <Text style={[styles.billingDate, { color: c.textMuted }]}>
              Next billing: {nextBilling}
            </Text>
          )}
          <View style={[styles.usageMeter, { borderTopColor: c.border }]}>
            <Text style={[styles.usageMeterLabel, { color: c.textMuted }]}>Campaign Usage</Text>
            <Text style={[styles.usageMeterValue, { color: c.text }]}>
              {subData?.organization_campaign_count ?? 0} / {subData?.subscription.limits.max_community_campaigns === 999999 ? "\u221e" : subData?.subscription.limits.max_community_campaigns}
            </Text>
          </View>
          {currentTier !== "free" && (
            <View style={styles.currentPlanActions}>
              <Pressable
                style={[styles.manageBillingBtn, { borderColor: c.border, flex: 1 }]}
                onPress={openBilling}
                disabled={busy}
              >
                <Ionicons name="card-outline" size={16} color={c.textMuted} />
                <Text style={[styles.manageBillingText, { color: c.text }]}>Manage Billing</Text>
              </Pressable>
              {!cancelAtPeriodEnd && (
                <Pressable
                  style={[styles.manageBillingBtn, { borderColor: c.danger + "66", flex: 1 }]}
                  onPress={handleCancelPlan}
                  disabled={busy}
                >
                  <Ionicons name="close-circle-outline" size={16} color={c.danger} />
                  <Text style={[styles.manageBillingText, { color: c.danger }]}>Cancel Plan</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const isUpgrade = PLANS.findIndex((p) => p.id === currentTier) < PLANS.findIndex((p) => p.id === plan.id);
          const isInstitutional = plan.id === "institutional";

          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                {
                  backgroundColor: isInstitutional ? c.institutionalCardBg : c.cardBg,
                  borderColor: isCurrent ? c.green : (isInstitutional ? c.institutionalCardBorder : c.border),
                  borderWidth: isCurrent ? 2 : 1,
                },
              ]}
            >
              <View style={styles.planCardHeader}>
                <Text style={[styles.planName, { color: isInstitutional ? c.institutionalCardText : c.text }]}>
                  {plan.name}
                </Text>
                {plan.popular && !isCurrent && (
                  <View style={[styles.tierBadge, { backgroundColor: c.green + "15", borderColor: c.green + "30" }]}>
                    <Text style={[styles.tierBadgeText, { color: c.green }]}>Recommended</Text>
                  </View>
                )}
                {isCurrent && (
                  <View style={[styles.tierBadge, { backgroundColor: c.green + "15", borderColor: c.green + "30" }]}>
                    <Ionicons name="checkmark-circle" size={12} color={c.green} />
                    <Text style={[styles.tierBadgeText, { color: c.green }]}>Active</Text>
                  </View>
                )}
              </View>

              <View style={styles.planPriceRow}>
                <Text style={[styles.planPrice, { color: isInstitutional ? c.institutionalCardText : c.text }]}>
                  {plan.price}
                </Text>
                <Text style={[styles.planPeriod, { color: isInstitutional ? c.institutionalCardTextMuted : c.textMuted }]}>
                  {plan.period}
                </Text>
              </View>

              <View style={[styles.planDivider, { backgroundColor: isInstitutional ? c.institutionalCardDivider : c.border }]} />

              <View style={styles.planFeatures}>
                {plan.features.map((feat, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View style={[styles.checkCircle, { backgroundColor: c.green + "15" }]}>
                      <Ionicons name="checkmark" size={12} color={c.green} />
                    </View>
                    <Text style={[styles.featureText, { color: isInstitutional ? c.institutionalCardTextFaint : c.text }]}>
                      {feat}
                    </Text>
                  </View>
                ))}
              </View>

              {isUpgrade && (
                <Pressable
                  style={[
                    styles.planButton,
                    {
                      backgroundColor: isInstitutional ? c.institutionalCardText : c.green,
                    },
                  ]}
                  onPress={() => setSummaryPlan(plan)}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.planButtonText,
                      { color: isInstitutional ? c.institutionalCardBg : Colors.white },
                    ]}
                  >
                    Upgrade to {plan.name}
                  </Text>
                </Pressable>
              )}
              {isCurrent && plan.id !== "free" && (
                <Pressable
                  style={[
                    styles.planButton,
                    {
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: isInstitutional ? c.institutionalCardDivider : c.border,
                    },
                  ]}
                  onPress={openBilling}
                  disabled={busy}
                >
                  <Text style={[styles.planButtonText, { color: isInstitutional ? c.institutionalCardTextFaint : c.text }]}>
                    Manage Subscription
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={[styles.sectionTitle, { color: c.text, marginTop: 28 }]}>
          Frequently Asked Questions
        </Text>

        {FAQ.map((item, i) => (
          <Pressable
            key={i}
            style={[styles.faqItem, { backgroundColor: c.cardBg, borderColor: c.border }]}
            onPress={() => setExpandedFaq(expandedFaq === i ? null : i)}
          >
            <View style={styles.faqHeader}>
              <Text style={[styles.faqQuestion, { color: c.text }]}>{item.q}</Text>
              <View style={[styles.faqChevron, { backgroundColor: expandedFaq === i ? c.green + "15" : "transparent" }]}>
                <Ionicons
                  name={expandedFaq === i ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={expandedFaq === i ? c.green : c.textMuted}
                />
              </View>
            </View>
            {expandedFaq === i && (
              <Text style={[styles.faqAnswer, { color: c.textMuted }]}>{item.a}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={!!summaryPlan} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.summaryModal, { backgroundColor: c.background }]}>
            <View style={[styles.summaryHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.summaryTitle, { color: c.text }]}>Billing Summary</Text>
              <Pressable onPress={() => setSummaryPlan(null)} style={[styles.closeBtn, { backgroundColor: c.cardBg }]}>
                <Ionicons name="close" size={20} color={c.textMuted} />
              </Pressable>
            </View>

            {summaryPlan && (
              <>
                <ScrollView contentContainerStyle={styles.summaryContent}>
                  <View style={[styles.summaryPlanCard, { backgroundColor: c.cardBg, borderColor: c.green }]}>
                    <View style={styles.summaryPlanHeader}>
                      <View>
                        <Text style={[styles.summaryPlanName, { color: c.text }]}>{summaryPlan.name} Plan</Text>
                        <Text style={[styles.summaryPlanDesc, { color: c.textMuted }]}>Monthly subscription</Text>
                      </View>
                      <View>
                        <Text style={[styles.summaryPlanPrice, { color: c.text }]}>{summaryPlan.price}</Text>
                        <Text style={[styles.summaryPlanPeriod, { color: c.textMuted }]}>/month</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.summarySection, { color: c.textMuted }]}>WHAT YOU GET</Text>
                  <View style={[styles.summaryFeatures, { backgroundColor: c.cardBg }]}>
                    {summaryPlan.features.map((feat, i) => (
                      <View key={i} style={[styles.summaryFeatureRow, i < summaryPlan.features.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                        <Ionicons name="checkmark-circle" size={18} color={c.green} />
                        <Text style={[styles.summaryFeatureText, { color: c.text }]}>{feat}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={[styles.summarySection, { color: c.textMuted }]}>BILLING DETAILS</Text>
                  <View style={[styles.summaryBilling, { backgroundColor: c.cardBg }]}>
                    <View style={styles.summaryBillingRow}>
                      <Text style={[styles.summaryBillingLabel, { color: c.textMuted }]}>{summaryPlan.name} Plan</Text>
                      <Text style={[styles.summaryBillingValue, { color: c.text }]}>{summaryPlan.price}</Text>
                    </View>
                    <View style={[styles.summaryBillingRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
                      <Text style={[styles.summaryBillingLabel, { color: c.textMuted }]}>Billing cycle</Text>
                      <Text style={[styles.summaryBillingValue, { color: c.text }]}>Monthly</Text>
                    </View>
                    <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
                    <View style={styles.summaryBillingRow}>
                      <Text style={[styles.summaryTotalLabel, { color: c.text }]}>Total due today</Text>
                      <Text style={[styles.summaryTotalValue, { color: c.text }]}>{summaryPlan.price}/mo</Text>
                    </View>
                  </View>

                  <View style={[styles.summaryNote, { backgroundColor: c.green + "08" }]}>
                    <Ionicons name="information-circle-outline" size={18} color={c.green} />
                    <Text style={[styles.summaryNoteText, { color: c.textMuted }]}>
                      You can cancel anytime. Your plan stays active until the end of the billing period.
                    </Text>
                  </View>
                </ScrollView>

                <View style={[styles.summaryFooter, { backgroundColor: c.background, borderTopColor: c.border }]}>
                  <Pressable
                    style={[styles.summaryPayBtn, { backgroundColor: c.green }]}
                    onPress={handleSummaryCheckout}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="lock-closed" size={16} color="#fff" />
                        <Text style={styles.summaryPayText}>Continue to Payment</Text>
                      </>
                    )}
                  </Pressable>

                  <Text style={[styles.summarySecure, { color: c.textMuted }]}>
                    Secure checkout powered by Stripe
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  headerTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 28,
    marginTop: 12,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
    marginBottom: 24,
    lineHeight: 22,
  },
  currentPlanCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    borderWidth: 1,
  },
  currentPlanRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  currentPlanLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13 },
  currentPlanName: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, marginTop: 2 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 12, textTransform: "capitalize" },
  cancelNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelNoticeText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, flex: 1, lineHeight: 19 },
  billingDate: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, marginTop: 12 },
  usageMeter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  usageMeterLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13 },
  usageMeterValue: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  currentPlanActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  manageBillingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  manageBillingText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13 },
  planCard: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  planCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  tierBadgeText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 11 },
  planName: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22 },
  planPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 16,
  },
  planPrice: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 36 },
  planPeriod: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 15, marginLeft: 2 },
  planDivider: {
    height: 1,
    marginBottom: 18,
  },
  planFeatures: { gap: 14 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, flex: 1 },
  planButton: {
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  planButtonText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15 },
  sectionTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 20, marginBottom: 16 },
  faqItem: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  faqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faqChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  faqQuestion: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14, flex: 1, marginRight: 8 },
  faqAnswer: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, marginTop: 12, lineHeight: 21 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  summaryModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  summaryTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  summaryPlanCard: {
    borderRadius: 14,
    padding: 18,
    borderWidth: 2,
    marginBottom: 24,
  },
  summaryPlanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryPlanName: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 },
  summaryPlanDesc: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, marginTop: 2 },
  summaryPlanPrice: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 24, textAlign: "right" },
  summaryPlanPeriod: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, textAlign: "right" },
  summarySection: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  summaryFeatures: {
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  summaryFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryFeatureText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, flex: 1 },
  summaryBilling: {
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  summaryBillingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryBillingLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14 },
  summaryBillingValue: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 14 },
  summaryDivider: { height: 1, marginHorizontal: 14 },
  summaryTotalLabel: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15 },
  summaryTotalValue: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 },
  summaryNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  summaryNoteText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, flex: 1, lineHeight: 19 },
  summaryFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryPayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  summaryPayText: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, color: "#fff" },
  summarySecure: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    textAlign: "center",
  },
});
