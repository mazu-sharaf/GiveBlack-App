import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { getCampaignImage } from "@/constants/images";
import OrgAvatar from "@/components/OrgAvatar";
import { Image } from "expo-image";

const QUICK_AMOUNTS = [5, 10, 25, 50, 100];

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
}

function ProgressBar({ raised, goal, color }: { raised: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(raised / goal, 1) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { flex: pct, backgroundColor: color }]} />
      <View style={{ flex: 1 - pct }} />
    </View>
  );
}

function CampaignCard({ campaign, index }: { campaign: any; index: number }) {
  const c = useThemeColors();
  const { isDark } = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const imageUrl = campaign.mainImageUrl || getCampaignImage(campaign.id);
  const pctRaised = campaign.goal > 0 ? Math.round((campaign.raised / campaign.goal) * 100) : 0;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).duration(400)}
      style={animStyle}
    >
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
        onPress={() => router.push({ pathname: "/campaign/[id]", params: { id: campaign.id } })}
        style={[
          styles.campaignCard,
          {
            backgroundColor: isDark ? "rgba(40,40,40,0.9)" : c.cardBg,
            borderColor: isDark ? "rgba(255,255,255,0.08)" : c.border,
          },
        ]}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.campaignImage} contentFit="cover" />
        ) : (
          <View style={[styles.campaignImagePlaceholder, { backgroundColor: c.surface }]}>
            <Ionicons name="heart" size={32} color={c.green} />
          </View>
        )}
        <View style={styles.campaignBody}>
          <View style={styles.campaignOrgRow}>
            <OrgAvatar
              imageUrl={campaign.orgImageUrl}
              initials={campaign.orgInitials || "?"}
              color={campaign.orgImageColor}
              size={20}
            />
            <Text style={[styles.campaignOrg, { color: c.textSecondary }]} numberOfLines={1}>
              {campaign.orgName}
            </Text>
            {campaign.orgVerified && (
              <Ionicons name="checkmark-circle" size={14} color={c.green} />
            )}
          </View>
          <Text style={[styles.campaignTitle, { color: c.text }]} numberOfLines={2}>
            {campaign.title}
          </Text>
          <ProgressBar raised={campaign.raised} goal={campaign.goal} color={c.green} />
          <View style={styles.campaignStats}>
            <Text style={[styles.statRaised, { color: c.green }]}>
              {formatCurrency(campaign.raised)}
            </Text>
            <Text style={[styles.statGoal, { color: c.textSecondary }]}>
              {" "}of {formatCurrency(campaign.goal)} · {pctRaised}%
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function GiveScreen() {
  const c = useThemeColors();
  const { isDark } = useTheme();
  const insets = useSafeInsets();
  const { user } = useAuth();
  const { campaigns, refresh } = useApp();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.type === "charity") {
      router.replace("/(tabs)/");
    }
  }, [user?.type]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const activeCampaigns = campaigns.filter((c) => c.status === "active" || !c.status);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.green}
          />
        }
      >
        <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
          <View style={[styles.heroIconWrap, { backgroundColor: `${c.green}22` }]}>
            <Ionicons name="heart" size={36} color={c.green} />
          </View>
          <Text style={[styles.heroTitle, { color: c.text }]}>Make a Difference</Text>
          <Text style={[styles.heroSub, { color: c.textSecondary }]}>
            {user
              ? "Choose a campaign below and donate today."
              : "Browse campaigns and support causes you care about."}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.quickSection}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Quick Amounts</Text>
          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((amt) => {
              const featuredCampaignId = activeCampaigns[0]?.id;
              return (
                <Pressable
                  key={amt}
                  onPress={() => {
                    if (featuredCampaignId) {
                      router.push({
                        pathname: "/campaign/[id]",
                        params: { id: featuredCampaignId, quick_amount: String(amt) },
                      });
                    } else {
                      router.push("/(tabs)/categories");
                    }
                  }}
                  style={({ pressed }) => [
                    styles.quickChip,
                    {
                      backgroundColor: pressed
                        ? c.green
                        : isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.06)",
                      borderColor: pressed ? c.green : c.border,
                    },
                  ]}
                >
                  {({ pressed }) => (
                    <Text
                      style={[
                        styles.quickChipText,
                        { color: pressed ? "#fff" : c.text },
                      ]}
                    >
                      ${amt}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <View style={styles.campaignsSection}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Featured Campaigns</Text>

          {activeCampaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={40} color={c.textSecondary} />
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                No active campaigns right now.
              </Text>
            </View>
          ) : (
            activeCampaigns.map((campaign, i) => (
              <CampaignCard key={campaign.id} campaign={campaign} index={i} />
            ))
          )}
        </View>

        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.browseSection}>
          <Pressable
            onPress={() => router.push("/(tabs)/categories")}
            style={[
              styles.browseBtn,
              { backgroundColor: c.green },
            ]}
          >
            <Ionicons name="grid-outline" size={18} color="#fff" />
            <Text style={styles.browseBtnText}>Browse by Category</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  hero: {
    alignItems: "center",
    paddingVertical: 24,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  quickSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 15,
    fontWeight: "600",
  },
  campaignsSection: {
    marginBottom: 24,
  },
  campaignCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
  },
  campaignImage: {
    width: "100%",
    height: 160,
  },
  campaignImagePlaceholder: {
    width: "100%",
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  campaignBody: {
    padding: 14,
    gap: 6,
  },
  campaignOrgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  campaignOrg: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  campaignTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  progressTrack: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
    marginVertical: 4,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  campaignStats: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  statRaised: {
    fontSize: 14,
    fontWeight: "700",
  },
  statGoal: {
    fontSize: 12,
  },
  browseSection: {
    alignItems: "center",
    paddingBottom: 8,
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 26,
  },
  browseBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});
