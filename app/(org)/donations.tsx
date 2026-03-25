import React, { useEffect, useState, useCallback } from "react";
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
import { getApiUrl } from "@/lib/query-client";
import { Ionicons } from "@expo/vector-icons";

interface DonationItem {
  id: string;
  donor_name: string;
  amount: number;
  created_at: string;
  date: string;
  campaign_title?: string;
  campaign_name?: string;
  message?: string;
  is_anonymous?: boolean;
  reference?: string;
}

type Period = "7" | "30" | "90" | "all";

export default function DonationsTab() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { session, user } = useAuth();
  const [donations, setDonations] = useState<DonationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("30");
  const [search, setSearch] = useState("");

  const base = getApiUrl().replace(/\/$/, "");
  const token = session?.accessToken ?? "";

  const loadDonations = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/org/my-donations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json.donations) ? json.donations : (Array.isArray(json) ? json : []);
        setDonations(items);
      }
    } catch (e) {
      console.log("Donations load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [base, token]);

  useEffect(() => {
    if (token) loadDonations();
  }, [token]);

  const onRefresh = () => { setRefreshing(true); loadDonations(); };

  const now = new Date();
  const periodDays = period === "all" ? 99999 : parseInt(period);
  const cutoff = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const filteredDonations = donations.filter((d) => {
    const dDate = new Date(d.created_at || d.date);
    if (dDate < cutoff) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (d.donor_name || "anonymous").toLowerCase();
      const camp = (d.campaign_title || d.campaign_name || "").toLowerCase();
      if (!name.includes(q) && !camp.includes(q)) return false;
    }
    return true;
  });

  const totalInPeriod = filteredDonations.reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0);
  const donorCount = new Set(filteredDonations.map((d) => d.donor_name || "anon")).size;
  const avgDonation = filteredDonations.length > 0 ? totalInPeriod / filteredDonations.length : 0;

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
            <Ionicons name="people" size={20} color="#6366f1" />
            <Text style={[styles.statValue, { color: c.text }]}>{donorCount}</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>Donors</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.cardBg }]}>
            <Ionicons name="wallet" size={20} color="#f59e0b" />
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
                  {(don.donor_name || "A").charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.donorName, { color: c.text }]} numberOfLines={1}>
                  {don.is_anonymous ? "Anonymous" : (don.donor_name || "Anonymous")}
                </Text>
                <Text style={[styles.donCampaign, { color: c.textMuted }]} numberOfLines={1}>
                  {don.campaign_title || don.campaign_name || "General donation"}
                </Text>
                <Text style={[styles.donDate, { color: c.textLight }]}>
                  {new Date(don.created_at || don.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
              <Text style={[styles.donAmount, { color: c.green }]}>
                ${parseFloat(String(don.amount)).toFixed(2)}
              </Text>
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
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 26 },
  periodRow: { marginBottom: 12, maxHeight: 44 },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  periodChipText: { fontFamily: "Poppins_500Medium", fontSize: 13 },
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
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11 },
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
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    padding: 0,
  },
  listHeader: {
    marginBottom: 10,
  },
  listTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  emptyCard: {
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
  },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 15, marginTop: 12 },
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
  donorInitial: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  donorName: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  donCampaign: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  donDate: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  donAmount: { fontFamily: "Poppins_700Bold", fontSize: 18 },
});
