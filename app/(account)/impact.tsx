import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import AppHeader from "@/components/AppHeader";

interface DonationSummary {
  total_amount_cents: number;
  donation_count: number;
  first_donation_at: string | null;
  last_donation_at: string | null;
  rank: number | null;
}

interface TopDonor {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  total_amount_cents: number;
  donation_count: number;
}

export default function ImpactScreen() {
  const { user, avatarUrl, donationSummary, refreshDonationSummary } = useAuth();

  useFocusEffect(
    useCallback(() => {
      void refreshDonationSummary();
    }, [refreshDonationSummary])
  );
  const insets = useSafeInsets();
  const c = useThemeColors();
  const [topDonors, setTopDonors] = useState<TopDonor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const base = getApiUrl().replace(/\/$/, "");
        const res = await fetch(`${base}/api/donors/top?limit=20`);
        if (res.ok) {
          const json = await res.json();
          setTopDonors(json.donors || []);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const total = (donationSummary?.total_amount_cents ?? 0) / 100;
  const lastDonationLabel = donationSummary?.last_donation_at
    ? `Last donation: ${new Date(donationSummary.last_donation_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}`
    : null;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="My Impact" showSearch={false} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={[styles.headerCard, { backgroundColor: c.cardBg }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} cachePolicy="memory-disk" transition={200} />
          ) : (
            <View style={[styles.avatarCircle, { backgroundColor: c.green }]}>
              <Text style={styles.avatarInitial}>
                {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: c.text }]} numberOfLines={1} ellipsizeMode="tail">
              {user?.name || "GiveBlack Member"}
            </Text>
            <Text style={[styles.email, { color: c.textMuted }]} numberOfLines={1} ellipsizeMode="tail">
              {user?.email || ""}
            </Text>
            <Text style={[styles.metric, { color: c.text }]}>
              Total donated: ${total.toFixed(2)}
            </Text>
            {lastDonationLabel && (
              <Text style={[styles.metric, { color: c.textMuted, fontSize: 13 }]}>{lastDonationLabel}</Text>
            )}
            {donationSummary?.rank && (
              <Text style={[styles.metric, { color: c.green }]}>
                Global rank: #{donationSummary.rank}
              </Text>
            )}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>Top 20 donors</Text>
        {loading ? (
          <ActivityIndicator size="small" color={c.green} />
        ) : topDonors.length === 0 ? (
          <Text style={[styles.empty, { color: c.textMuted }]}>No donors yet.</Text>
        ) : (
          topDonors.map((d, i) => (
            <View key={d.id} style={[styles.donorRow, { borderColor: c.border }]}>
              <Text style={[styles.rank, { color: c.textMuted }]}>#{i + 1}</Text>
              <View style={styles.donorAvatarWrap}>
                {d.avatar_url ? (
                  <Image source={{ uri: d.avatar_url }} style={styles.donorAvatar} cachePolicy="memory-disk" transition={200} />
                ) : (
                  <View style={[styles.donorAvatar, { backgroundColor: c.green }]}>
                    <Text style={styles.donorInitial}>
                      {(d.first_name || d.name || "U").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.donorText}>
                <Text style={[styles.donorName, { color: c.text }]} numberOfLines={2} ellipsizeMode="tail">
                  {d.last_name
                    ? `${d.first_name || ""} ${d.last_name}`.trim()
                    : d.name}
                </Text>
              </View>
              <View style={styles.donorAmount}>
                <Text style={[styles.amount, { color: c.text }]}>
                  ${(d.total_amount_cents / 100).toLocaleString()}
                </Text>
                <Text style={[styles.donationCount, { color: c.textMuted }]}>
                  {d.donation_count} donations
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 18,
    marginBottom: 24,
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
  },
  headerText: {
    marginLeft: 14,
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
  },
  email: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  metric: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    marginBottom: 12,
  },
  empty: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
  },
  donorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    width: 28,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
  },
  donorAvatarWrap: { marginRight: 8 },
  donorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  donorInitial: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  donorText: { flex: 1, minWidth: 0 },
  donorName: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
  },
  donorAmount: {
    alignItems: "flex-end",
    minWidth: 80,
  },
  amount: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  donationCount: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
  },
});

