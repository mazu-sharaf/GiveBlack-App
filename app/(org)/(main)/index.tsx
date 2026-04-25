import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { donorDisplayName } from "@/lib/donor-display";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

interface SubData {
  org_id: string | null;
  subscription: {
    tier: string;
    status: string;
    current_period_end: string | null;
    limits: { max_community_campaigns: number; max_goal_per_campaign: number };
  };
  community_campaign_count: number;
  organization_campaign_count: number;
}

interface Campaign {
  id: string;
  title: string;
  status: string;
  goal: number;
  raised: number;
}

interface DonationItem {
  id: string;
  donor_name: string;
  amount: number;
  created_at: string;
  campaign_title?: string;
}

interface MyDonationsPayload {
  donations?: DonationItem[];
  stats?: {
    all_time_total: unknown;
    all_time_donors: unknown;
    month_total: unknown;
  } | null;
}

interface MyCampaignsPayload {
  campaigns?: Campaign[];
  org_stats?: {
    total_raised: unknown;
    donors_count_sum: unknown;
    month_raised: unknown;
  } | null;
}

function parseMoney(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseCount(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export default function OrgDashboardHome() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { session, user, fetchWithAuth } = useAuth();
  const [subData, setSubData] = useState<SubData | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [donations, setDonations] = useState<DonationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalRaised, setTotalRaised] = useState(0);
  const [totalDonors, setTotalDonors] = useState(0);
  const [monthRaised, setMonthRaised] = useState(0);

  const loadData = useCallback(async () => {
    if (!session) return;
    try {
      try {
        const subRes = await fetchWithAuth("/api/charity/my-subscription", { method: "GET" });
        if (subRes.ok) {
          const sub = (await subRes.json()) as SubData;
          setSubData(sub);
        }
      } catch {
        // silent – keep existing cached value
      }

      const campRes = await fetchWithAuth("/api/org/my-campaigns", { method: "GET" });
      const campJson = campRes.ok ? ((await campRes.json()) as MyCampaignsPayload) : {};
      setCampaigns(Array.isArray(campJson.campaigns) ? campJson.campaigns : []);
      const orgStats = campJson.org_stats;

      const donRes = await fetchWithAuth("/api/org/my-donations", { method: "GET" });
      if (donRes.ok) {
        const donJson = (await donRes.json()) as MyDonationsPayload;
        const items = Array.isArray(donJson.donations) ? donJson.donations : [];
        setDonations(items.slice(0, 5));
        const st = donJson.stats;
        let raised = 0;
        let donors = 0;
        let month = 0;
        if (st != null && (st.all_time_total != null || st.all_time_donors != null || st.month_total != null)) {
          raised = parseMoney(st.all_time_total);
          donors = parseCount(st.all_time_donors);
          month = parseMoney(st.month_total);
        } else {
          const succeeded = items.filter(
            (d: DonationItem & { status?: string; date?: string }) =>
              String(d.status || "").toLowerCase() === "succeeded"
          );
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          month = succeeded
            .filter((d) => new Date(d.created_at || (d as { date?: string }).date || 0) >= monthStart)
            .reduce((s: number, d) => s + (parseFloat(String(d.amount)) || 0), 0);
          raised = succeeded.reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0);
          donors = new Set(succeeded.map((d) => donorDisplayName(d))).size;
        }
        if (raised <= 0 && orgStats && parseMoney(orgStats.total_raised) > 0) {
          raised = parseMoney(orgStats.total_raised);
          donors = parseCount(orgStats.donors_count_sum);
        }
        if (month <= 0 && orgStats && parseMoney(orgStats.month_raised) > 0) {
          month = parseMoney(orgStats.month_raised);
        }
        setTotalRaised(raised);
        setTotalDonors(donors);
        setMonthRaised(month);
      } else if (orgStats) {
        setTotalRaised(parseMoney(orgStats.total_raised));
        setTotalDonors(parseCount(orgStats.donors_count_sum));
        setMonthRaised(parseMoney(orgStats.month_raised));
      }
    } catch (e) {
      console.log("Dashboard load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, fetchWithAuth, user?.email]);

  useFocusEffect(
    useCallback(() => {
      if (session) loadData();
    }, [session, loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const tier = subData?.subscription.tier ?? "free";
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const maxCampaigns = subData?.subscription.limits.max_community_campaigns ?? 1;
  const maxGoal = subData?.subscription.limits.max_goal_per_campaign ?? 5000;

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
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeText, { color: c.textMuted }]}>Welcome back</Text>
          <Text style={[styles.orgName, { color: c.text }]} numberOfLines={1}>
            {user?.charityName || "Your Organization"}
          </Text>
        </View>

        <View style={[styles.planCard, { backgroundColor: c.green }]}>
          <View style={styles.planCardHeader}>
            <View>
              <Text style={styles.planLabel}>Current Plan</Text>
              <Text style={styles.planTier}>{tierLabel}</Text>
            </View>
            <View style={styles.planBadge}>
              <Ionicons name="diamond" size={16} color="#fff" />
              <Text style={styles.planBadgeText}>{subData?.subscription.status || "active"}</Text>
            </View>
          </View>
          <View style={styles.planStats}>
            <View style={styles.planStat}>
              <Text style={styles.planStatValue}>
                {Math.max(subData?.organization_campaign_count ?? 0, campaigns.length)}/{maxCampaigns === 999999 ? "∞" : maxCampaigns}
              </Text>
              <Text style={styles.planStatLabel}>Campaigns</Text>
            </View>
            <View style={[styles.planDivider, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
            <View style={styles.planStat}>
              <Text style={styles.planStatValue}>${maxGoal >= 999999 ? "∞" : maxGoal.toLocaleString()}</Text>
              <Text style={styles.planStatLabel}>Max Goal</Text>
            </View>
          </View>
          {tier === "free" && (
            <Pressable
              style={styles.upgradeBtn}
              onPress={() => router.push("/(org)/subscriptions")}
            >
              <Text style={styles.upgradeBtnText}>Upgrade Plan</Text>
              <Ionicons name="arrow-forward" size={14} color={c.green} />
            </Pressable>
          )}
        </View>

        <View style={styles.quickActions}>
          <Pressable
            style={[styles.quickAction, { backgroundColor: c.cardBg, borderColor: c.border }]}
            onPress={() => router.push("/(org)/campaigns")}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: c.green + "15" }]}>
              <Ionicons name="add-circle" size={22} color={c.green} />
            </View>
            <Text style={[styles.quickActionText, { color: c.text }]}>Create Campaign</Text>
          </Pressable>
          <Pressable
            style={[styles.quickAction, { backgroundColor: c.cardBg, borderColor: c.border }]}
            onPress={() => router.push("/(org)/donations")}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: "#6366f115" }]}>
              <Ionicons name="analytics" size={22} color="#6366f1" />
            </View>
            <Text style={[styles.quickActionText, { color: c.text }]}>View Analytics</Text>
          </Pressable>
        </View>

        <View style={styles.statsGrid}>
          {[
            { label: "Total Raised", value: `$${totalRaised.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, icon: "trending-up" as const, color: "#10b981" },
            { label: "This Month", value: `$${monthRaised.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, icon: "calendar" as const, color: "#6366f1" },
            { label: "Total Donors", value: totalDonors.toString(), icon: "people" as const, color: "#f59e0b" },
            { label: "Active Campaigns", value: activeCampaigns.toString(), icon: "megaphone" as const, color: "#ec4899" },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: c.cardBg }]}>
              <View style={[styles.statIcon, { backgroundColor: stat.color + "12" }]}>
                <Ionicons name={stat.icon} size={18} color={stat.color} />
              </View>
              <Text style={[styles.statValue, { color: c.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Recent Campaigns</Text>
          <Pressable onPress={() => router.push("/(org)/campaigns")}>
            <Text style={[styles.seeAll, { color: c.green }]}>See all</Text>
          </Pressable>
        </View>

        {campaigns.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: c.cardBg }]}>
            <Ionicons name="megaphone-outline" size={32} color={c.textMuted} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No campaigns yet</Text>
            <Text style={[styles.emptySubtext, { color: c.textLight }]}>Create your first campaign to start receiving donations</Text>
          </View>
        ) : (
          campaigns.slice(0, 4).map((camp) => {
            const progress = camp.goal > 0 ? Math.min((camp.raised / camp.goal) * 100, 100) : 0;
            const statusColor =
              camp.status === "active" ? "#10b981" :
              camp.status === "paused" ? "#f59e0b" :
              camp.status === "completed" ? "#6366f1" : c.textMuted;
            return (
              <View key={camp.id} style={[styles.campaignCard, { backgroundColor: c.cardBg }]}>
                <View style={styles.campaignHeader}>
                  <Text style={[styles.campaignTitle, { color: c.text }]} numberOfLines={1}>{camp.title}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "15" }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{camp.status}</Text>
                  </View>
                </View>
                <View style={styles.campaignAmounts}>
                  <Text style={[styles.raisedAmount, { color: c.green }]}>${camp.raised.toLocaleString()}</Text>
                  <Text style={[styles.goalAmount, { color: c.textMuted }]}> / ${camp.goal.toLocaleString()}</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                  <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: c.green }]} />
                </View>
              </View>
            );
          })
        )}

        {donations.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Recent Donations</Text>
              <Pressable onPress={() => router.push("/(org)/donations")}>
                <Text style={[styles.seeAll, { color: c.green }]}>See all</Text>
              </Pressable>
            </View>
            {donations.slice(0, 3).map((don, i) => (
              <View key={don.id || i} style={[styles.donationRow, { backgroundColor: c.cardBg }]}>
                <View style={[styles.donorAvatar, { backgroundColor: c.green + "15" }]}>
                  <Ionicons name="person" size={16} color={c.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.donorName, { color: c.text }]} numberOfLines={1}>
                    {donorDisplayName(don)}
                  </Text>
                  <Text style={[styles.donationDate, { color: c.textMuted }]}>
                    {don.campaign_title || new Date(don.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[styles.donationAmount, { color: c.green }]}>
                  +${parseFloat(String(don.amount)).toFixed(2)}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  welcomeSection: { marginTop: 12, marginBottom: 20 },
  welcomeText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  orgName: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 2 },
  planCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  planCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  planLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)" },
  planTier: { fontFamily: "Poppins_700Bold", fontSize: 24, color: "#fff", marginTop: 2 },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  planBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#fff", textTransform: "capitalize" },
  planStats: {
    flexDirection: "row",
    marginTop: 20,
    gap: 0,
  },
  planStat: { flex: 1, alignItems: "center" },
  planStatValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#fff" },
  planStatLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  planDivider: { width: 1, height: 36, alignSelf: "center" },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  upgradeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#2D9E6B" },
  quickActions: { flexDirection: "row", gap: 12, marginBottom: 20 },
  quickAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, flex: 1 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: "47%",
    flexGrow: 1,
    borderRadius: 16,
    padding: 16,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18 },
  seeAll: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  emptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginBottom: 16,
  },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, marginTop: 12 },
  emptySubtext: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4, textAlign: "center" },
  campaignCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  campaignHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  campaignTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, flex: 1, marginRight: 8 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontFamily: "Poppins_500Medium", fontSize: 11, textTransform: "capitalize" },
  campaignAmounts: { flexDirection: "row", alignItems: "baseline", marginBottom: 8 },
  raisedAmount: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  goalAmount: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  donationRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  donorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  donorName: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  donationDate: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  donationAmount: { fontFamily: "Poppins_700Bold", fontSize: 16 },
});
