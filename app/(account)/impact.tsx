import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeInsets } from "@/lib/safe-area";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { getPreferredDisplayName } from "@/lib/user-display";
import AppHeader from "@/components/AppHeader";
import GuestLockSheet from "@/components/GuestLockSheet";

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

function ImpactContent() {
  const { user, avatarUrl, donationSummary, refreshDonationSummary } = useAuth();
  const displayName = getPreferredDisplayName(user?.name, user?.email, "GiveBlack Member");
  const selfAvatarDisplay = resolveAvatarUrl(avatarUrl);

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
      } catch {
        // Network error: show empty state
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
          {selfAvatarDisplay ? (
            <Image source={{ uri: selfAvatarDisplay }} style={styles.avatarImage} cachePolicy="memory-disk" transition={200} />
          ) : (
            <View style={[styles.avatarCircle, { backgroundColor: c.green }]}>
              <Text style={styles.avatarInitial}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: c.text }]} numberOfLines={1} ellipsizeMode="tail">
              {displayName}
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
          topDonors.map((d, i) => {
            const donorAvatarUri = resolveAvatarUrl(d.avatar_url);
            return (
            <View key={d.id} style={[styles.donorRow, { borderColor: c.border }]}>
              <Text style={[styles.rank, { color: c.textMuted }]}>#{i + 1}</Text>
              <View style={styles.donorAvatarWrap}>
                {donorAvatarUri ? (
                  <Image
                    source={{ uri: donorAvatarUri }}
                    style={styles.donorAvatar}
                    cachePolicy="memory-disk"
                    transition={200}
                  />
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
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

export default function ImpactScreen() {
  const { isGuest } = useAuth();
  const router = useRouter();
  const c = useThemeColors();
  const [showGuestSheet, setShowGuestSheet] = useState(true);

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title="My Impact" showSearch={false} />
        <View style={styles.lockedEmptyState}>
          <Ionicons name="bar-chart-outline" size={52} color={c.textLight} />
          <Text style={[styles.lockedEmptyTitle, { color: c.text }]}>Track your impact</Text>
          <Text style={[styles.lockedEmptyMsg, { color: c.textMuted }]}>
            Sign in or create a free account to view your giving history and global rank.
          </Text>
          <View style={styles.lockedCtas}>
            <Pressable
              style={[styles.lockedEmptyBtn, { backgroundColor: c.green }]}
              onPress={() => setShowGuestSheet(true)}
            >
              <Text style={styles.lockedEmptyBtnText}>Create Account</Text>
            </Pressable>
            <Pressable
              style={[styles.lockedEmptyBtnSecondary, { borderColor: c.border }]}
              onPress={() =>
                router.push({
                  pathname: "/(auth)/donor-login",
                  params: { returnTo: "/(account)/impact" },
                })
              }
            >
              <Text style={[styles.lockedEmptyBtnSecondaryText, { color: c.text }]}>Sign in</Text>
            </Pressable>
          </View>
        </View>
        <GuestLockSheet
          visible={showGuestSheet}
          icon="bar-chart-outline"
          title="Track your impact"
          message="Create a free account to see your total donated, your global giving rank, and celebrate your donation journey."
          onCreateAccount={() =>
            router.push({
              pathname: "/(auth)/donor-signup",
              params: { returnTo: "/(account)/impact", feature: "impact" },
            })
          }
          onSignIn={() =>
            router.push({
              pathname: "/(auth)/donor-login",
              params: { returnTo: "/(account)/impact" },
            })
          }
          onDismiss={() => setShowGuestSheet(false)}
        />
      </View>
    );
  }

  return <ImpactContent />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  lockedEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 12,
  },
  lockedEmptyTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    textAlign: "center",
    marginTop: 8,
  },
  lockedEmptyMsg: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  lockedEmptyBtn: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  lockedEmptyBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    color: Colors.white,
  },
  lockedCtas: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  lockedEmptyBtnSecondary: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedEmptyBtnSecondaryText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
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
    color: Colors.white,
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
    color: Colors.white,
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
