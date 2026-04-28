import React, { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { donorDisplayName, donorInitial } from "@/lib/donor-display";
import { Ionicons } from "@expo/vector-icons";

interface DonationItem {
  id: string;
  donor_name: string;
  amount: number;
  net_amount?: number | null;
  created_at: string;
  date: string;
  status?: string;
  donor_email?: string;
  campaign_title?: string;
  campaign_name?: string;
  message?: string;
  is_anonymous?: boolean;
  reference?: string;
}

type Period = "7" | "30" | "90" | "all";
type StatusFilter = "all" | "succeeded" | "pending" | "failed";

function parseYyyyMmDdToUtcStart(s: string): number | null {
  const raw = String(s || "").trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
}

function parseYyyyMmDdToUtcEndInclusive(s: string): number | null {
  const start = parseYyyyMmDdToUtcStart(s);
  if (start == null) return null;
  // end of day inclusive
  return start + 24 * 60 * 60 * 1000 - 1;
}

interface DonationStats {
  all_time_total: number;
  all_time_donors: number;
  all_time_donation_count: number;
  month_total: number;
  month_donors: number;
  month_donation_count: number;
  last_7d_total: number;
  last_7d_donors: number;
  last_7d_donation_count: number;
  last_30d_total: number;
  last_30d_donors: number;
  last_30d_donation_count: number;
  last_90d_total: number;
  last_90d_donors: number;
  last_90d_donation_count: number;
}

function normalizeDonationStats(st: Record<string, unknown>): DonationStats {
  const money = (key: string) => {
    const v = st[key];
    if (v == null || v === "") return 0;
    const x = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    return Number.isFinite(x) ? x : 0;
  };
  const count = (key: string) => Math.round(money(key));
  return {
    all_time_total: money("all_time_total"),
    all_time_donors: count("all_time_donors"),
    all_time_donation_count: count("all_time_donation_count"),
    month_total: money("month_total"),
    month_donors: count("month_donors"),
    month_donation_count: count("month_donation_count"),
    last_7d_total: money("last_7d_total"),
    last_7d_donors: count("last_7d_donors"),
    last_7d_donation_count: count("last_7d_donation_count"),
    last_30d_total: money("last_30d_total"),
    last_30d_donors: count("last_30d_donors"),
    last_30d_donation_count: count("last_30d_donation_count"),
    last_90d_total: money("last_90d_total"),
    last_90d_donors: count("last_90d_donors"),
    last_90d_donation_count: count("last_90d_donation_count"),
  };
}

function statsFromOrgStats(os: Record<string, unknown>): DonationStats {
  const n = (k: string) => {
    const v = os[k];
    if (v == null || v === "") return 0;
    const x = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    return Number.isFinite(x) ? x : 0;
  };
  const ni = (k: string) => Math.round(n(k));
  return {
    all_time_total: n("total_raised"),
    all_time_donors: ni("donors_count_sum"),
    all_time_donation_count: ni("campaign_linked_donation_count"),
    month_total: n("month_raised"),
    month_donors: ni("month_donation_count"),
    month_donation_count: ni("month_donation_count"),
    last_7d_total: n("last_7d_raised"),
    last_7d_donors: ni("last_7d_donation_count"),
    last_7d_donation_count: ni("last_7d_donation_count"),
    last_30d_total: n("last_30d_raised"),
    last_30d_donors: ni("last_30d_donation_count"),
    last_30d_donation_count: ni("last_30d_donation_count"),
    last_90d_total: n("last_90d_raised"),
    last_90d_donors: ni("last_90d_donation_count"),
    last_90d_donation_count: ni("last_90d_donation_count"),
  };
}

export default function DonationsTab() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { session, user, fetchWithAuth } = useAuth();
  const [donations, setDonations] = useState<DonationItem[]>([]);
  const [stats, setStats] = useState<DonationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("30");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const loadDonations = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchWithAuth("/api/org/my-donations", { method: "GET" });
      const campRes = await fetchWithAuth("/api/org/my-campaigns", { method: "GET" });
      let items: DonationItem[] = [];
      let nextStats: DonationStats | null = null;

      if (res.ok) {
        const json = await res.json();
        items = Array.isArray(json.donations) ? json.donations : (Array.isArray(json) ? json : []);
        const raw = json.stats;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          nextStats = normalizeDonationStats(raw as Record<string, unknown>);
        }
      }

      if (campRes.ok) {
        const cj = (await campRes.json()) as { org_stats?: Record<string, unknown> };
        const os = cj.org_stats;
        if (os && typeof os === "object") {
          const fromCamp = statsFromOrgStats(os);
          if (fromCamp.all_time_total > 0 && (!nextStats || nextStats.all_time_total <= 0)) {
            nextStats = fromCamp;
          }
        }
      }

      setDonations(items);
      setStats(nextStats);
    } catch (e) {
      console.log("Donations load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, fetchWithAuth]);

  useFocusEffect(
    useCallback(() => {
      if (session) loadDonations();
    }, [session, loadDonations])
  );

  const onRefresh = () => { setRefreshing(true); loadDonations(); };

  const now = new Date();
  const periodDays = period === "all" ? 99999 : parseInt(period);
  const cutoff = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const campaignOptions = (() => {
    const set = new Set<string>();
    for (const d of donations) {
      const t = String(d.campaign_title || d.campaign_name || "").trim();
      if (t) set.add(t);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  })();

  const fromUtc = parseYyyyMmDdToUtcStart(dateFrom);
  const toUtc = parseYyyyMmDdToUtcEndInclusive(dateTo);

  const filteredDonations = donations.filter((d) => {
    const raw = d.created_at || d.date;
    const t = raw ? Date.parse(String(raw)) : NaN;
    if (!Number.isNaN(t)) {
      const dDate = new Date(t);
      if (dDate < cutoff) return false;
    }
    if (fromUtc != null || toUtc != null) {
      if (Number.isNaN(t)) return false;
      const utc = t;
      if (fromUtc != null && utc < fromUtc) return false;
      if (toUtc != null && utc > toUtc) return false;
    }
    if (statusFilter !== "all") {
      if (String(d.status || "").toLowerCase() !== statusFilter) return false;
    }
    if (campaignFilter !== "all") {
      const camp = String(d.campaign_title || d.campaign_name || "").trim();
      if (camp !== campaignFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const name = donorDisplayName(d).toLowerCase();
      const camp = (d.campaign_title || d.campaign_name || "").toLowerCase();
      if (!name.includes(q) && !camp.includes(q)) return false;
    }
    return true;
  });

  const succeededInPeriod = filteredDonations.filter(
    (d) => String(d.status || "").toLowerCase() === "succeeded"
  );

  let totalInPeriod: number;
  let donorCount: number;
  let avgDonation: number;

  if (stats) {
    switch (period) {
      case "7":
        totalInPeriod = stats.last_7d_total;
        donorCount = stats.last_7d_donors;
        avgDonation =
          stats.last_7d_donation_count > 0 ? stats.last_7d_total / stats.last_7d_donation_count : 0;
        break;
      case "30":
        totalInPeriod = stats.last_30d_total;
        donorCount = stats.last_30d_donors;
        avgDonation =
          stats.last_30d_donation_count > 0 ? stats.last_30d_total / stats.last_30d_donation_count : 0;
        break;
      case "90":
        totalInPeriod = stats.last_90d_total;
        donorCount = stats.last_90d_donors;
        avgDonation =
          stats.last_90d_donation_count > 0 ? stats.last_90d_total / stats.last_90d_donation_count : 0;
        break;
      default:
        totalInPeriod = stats.all_time_total;
        donorCount = stats.all_time_donors;
        avgDonation =
          stats.all_time_donation_count > 0 ? stats.all_time_total / stats.all_time_donation_count : 0;
    }
  } else {
    totalInPeriod = succeededInPeriod.reduce((s, d) => {
      const v = d.net_amount ?? d.amount;
      return s + (parseFloat(String(v)) || 0);
    }, 0);
    donorCount = new Set(succeededInPeriod.map((d) => donorDisplayName(d))).size;
    avgDonation = succeededInPeriod.length > 0 ? totalInPeriod / succeededInPeriod.length : 0;
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
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: c.text }]}>Donations</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.periodRow}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {([
          { key: "7" as Period, label: "Last 7 days" },
          { key: "30" as Period, label: "Last 30 days" },
          { key: "90" as Period, label: "Last 90 days" },
          { key: "all" as Period, label: "All time" },
        ]).map((p) => (
          <Pressable
            key={p.key}
            style={[
              styles.periodChip,
              {
                backgroundColor: period === p.key ? c.green : c.cardBg,
                borderColor: period === p.key ? c.green : c.border,
              },
            ]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodChipText, { color: period === p.key ? "#fff" : c.textMuted }]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.green} />}
      >
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: c.cardBg }]}>
            <Ionicons name="trending-up" size={20} color={c.green} />
            <Text style={[styles.statValue, { color: c.text }]}>
              ${totalInPeriod.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>Total Raised</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.cardBg }]}>
            <Ionicons name="people" size={20} color={c.indigoAccent} />
            <Text style={[styles.statValue, { color: c.text }]}>{donorCount}</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>Donors</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.cardBg }]}>
            <Ionicons name="wallet" size={20} color={c.warningAmber} />
            <Text style={[styles.statValue, { color: c.text }]}>
              ${avgDonation.toFixed(0)}
            </Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>Avg</Text>
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: c.cardBg }]}>
          <Ionicons name="search" size={18} color={c.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search by donor or campaign..."
            placeholderTextColor={c.textLight}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={c.textMuted} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        >
          {([
            { key: "all" as const, label: "All" },
            { key: "succeeded" as const, label: "Succeeded" },
            { key: "pending" as const, label: "Pending" },
            { key: "failed" as const, label: "Failed" },
          ]).map((s) => {
            const active = statusFilter === s.key;
            return (
              <Pressable
                key={s.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? c.green : c.cardBg,
                    borderColor: active ? c.green : c.border,
                  },
                ]}
                onPress={() => setStatusFilter(s.key)}
              >
                <Text style={[styles.filterChipText, { color: active ? "#fff" : c.textMuted }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}

          {campaignOptions.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {campaignOptions.map((opt) => {
                const label = opt === "all" ? "All campaigns" : opt;
                const active = campaignFilter === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? c.indigoAccent : c.cardBg,
                        borderColor: active ? c.indigoAccent : c.border,
                      },
                    ]}
                    onPress={() => setCampaignFilter(opt)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? "#fff" : c.textMuted, maxWidth: 180 },
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </ScrollView>

        <View style={[styles.dateRow, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Ionicons name="calendar" size={16} color={c.textMuted} />
          <TextInput
            style={[styles.dateInput, { color: c.text }]}
            placeholder="From YYYY-MM-DD"
            placeholderTextColor={c.textLight}
            value={dateFrom}
            onChangeText={setDateFrom}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={{ color: c.textMuted, marginHorizontal: 6 }}>to</Text>
          <TextInput
            style={[styles.dateInput, { color: c.text }]}
            placeholder="To YYYY-MM-DD"
            placeholderTextColor={c.textLight}
            value={dateTo}
            onChangeText={setDateTo}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {(statusFilter !== "all" || campaignFilter !== "all" || dateFrom.trim() || dateTo.trim() || search.trim()) && (
            <Pressable
              onPress={() => {
                setStatusFilter("all");
                setCampaignFilter("all");
                setDateFrom("");
                setDateTo("");
                setSearch("");
              }}
              style={[styles.clearBtn, { borderColor: c.border }]}
            >
              <Text style={[styles.clearBtnText, { color: c.textMuted }]}>Clear</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.listHeader}>
          <Text style={[styles.listTitle, { color: c.text }]}>
            {filteredDonations.length} donation{filteredDonations.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {filteredDonations.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: c.cardBg }]}>
            <Ionicons name="receipt-outline" size={36} color={c.textMuted} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No donations found</Text>
          </View>
        ) : (
          filteredDonations.map((don, i) => (
            <View key={don.id || i} style={[styles.donationCard, { backgroundColor: c.cardBg }]}>
              <View style={[styles.donorAvatar, { backgroundColor: c.green + "15" }]}>
                <Text style={[styles.donorInitial, { color: c.green }]}>
                  {donorInitial(don)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.donorName, { color: c.text }]} numberOfLines={1}>
                  {donorDisplayName(don)}
                </Text>
                <Text style={[styles.donCampaign, { color: c.textMuted }]} numberOfLines={1}>
                  {don.campaign_title || don.campaign_name || "General donation"}
                </Text>
                <Text style={[styles.donDate, { color: c.textLight }]}>
                  {new Date(don.created_at || don.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
              {String(don.status || "").toLowerCase() === "succeeded" ? (
                <Text style={[styles.donAmount, { color: c.green }]}>
                  ${parseFloat(String(don.net_amount ?? don.amount)).toFixed(2)}
                </Text>
              ) : (
                <Text style={[styles.donAmount, { color: c.textMuted }]}>—</Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 26 },
  periodRow: { marginBottom: 12, maxHeight: 44 },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  periodChipText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13 },
  content: { paddingHorizontal: 20 },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    padding: 0,
  },
  filterRow: { marginBottom: 10, maxHeight: 44 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterChipText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 12 },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  dateInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    padding: 0,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clearBtnText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 12 },
  listHeader: {
    marginBottom: 10,
  },
  listTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16 },
  emptyCard: {
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
  },
  emptyText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 15, marginTop: 12 },
  donationCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  donorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  donorInitial: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 },
  donorName: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  donCampaign: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, marginTop: 1 },
  donDate: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, marginTop: 2 },
  donAmount: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 },
});
