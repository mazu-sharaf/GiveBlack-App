import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import AppHeader from "@/components/AppHeader";
import OrgAvatar from "@/components/OrgAvatar";
import { getApiUrl } from "@/lib/query-client";
import { getCampaignImage } from "@/constants/images";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OrgDetail {
  id: string;
  name: string;
  description?: string;
  raised: number;
  goal: number;
  donor_count: number;
  image_url?: string;
  cover_image_url?: string;
  category_id?: string;
  verified?: boolean;
  contact_email?: string;
  website?: string;
  org_tier?: string;
  campaigns: Array<{
    id: string;
    title: string;
    description?: string;
    main_image_url?: string;
    goal: number;
    raised: number;
    donor_count: number;
    status: string;
  }>;
}

function resolveImgUrl(base: string, url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeInsets();
  const c = useThemeColors();
  const bottomPad = insets.bottom;

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const base = getApiUrl().replace(/\/$/, "");
        const res = await fetch(`${base}/api/organizations/${id}`);
        if (res.ok) {
          const data = await res.json();
          setOrg({
            ...data,
            image_url: resolveImgUrl(base, data.image_url),
            cover_image_url: resolveImgUrl(base, data.cover_image_url),
            campaigns: (data.campaigns || []).map((c: any) => ({
              ...c,
              main_image_url: resolveImgUrl(base, c.main_image_url),
            })),
          });
        }
      } catch {
        // no-op
      } finally {
        setLoading(false);
      }
    };
    fetchOrg();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.green} />
      </View>
    );
  }

  if (!org) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={c.textMuted} />
        <Text style={[styles.errorText, { color: c.textMuted }]}>Organization not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backText, { color: c.green }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="Organization" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
      >
        {org.cover_image_url ? (
          <Image
            source={{ uri: org.cover_image_url }}
            style={styles.headerImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
          />
        ) : (
          <View style={[styles.headerBg, { backgroundColor: c.green }]} />
        )}

        <View style={styles.avatarWrap}>
          <OrgAvatar
            imageUrl={org.image_url}
            initials={org.name.slice(0, 2).toUpperCase()}
            imageColor={c.green}
            size={80}
            fontSize={28}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={[styles.orgName, { color: c.text }]}>{org.name}</Text>
            {org.verified && <Ionicons name="checkmark-circle" size={20} color={c.green} />}
          </View>

          {org.description && (
            <Text style={[styles.description, { color: c.textMuted }]}>{org.description}</Text>
          )}

          <View style={[styles.statsRow, { backgroundColor: c.cardBg }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: c.text }]}>
                ${org.raised >= 1000 ? (org.raised / 1000).toFixed(1) + "K" : Number(org.raised).toFixed(0)}
              </Text>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>Total Raised</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: c.text }]}>{org.donor_count}</Text>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>Total Donors</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: c.text }]}>{org.campaigns?.length ?? 0}</Text>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>Campaigns</Text>
            </View>
          </View>

          {org.website && (
            <View style={[styles.infoRow, { borderColor: c.border }]}>
              <Ionicons name="globe-outline" size={18} color={c.green} />
              <Text style={[styles.infoText, { color: c.textMuted }]}>{org.website}</Text>
            </View>
          )}

          {org.campaigns && org.campaigns.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Active Campaigns</Text>
              {org.campaigns.map((camp, i) => {
                const pct = camp.goal > 0 ? Math.min((camp.raised / camp.goal) * 100, 100) : 0;
                return (
                  <Pressable
                    key={camp.id}
                    style={[styles.campaignCard, { backgroundColor: c.cardBg }]}
                    onPress={() => router.push({ pathname: "/campaign/[id]", params: { id: camp.id } })}
                  >
                    <Image
                      source={camp.main_image_url ? { uri: camp.main_image_url } : getCampaignImage(i)}
                      style={styles.campaignImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={camp.id}
                      transition={200}
                      placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                    />
                    <View style={styles.campaignBody}>
                      <Text style={[styles.campaignTitle, { color: c.text }]} numberOfLines={2}>{camp.title}</Text>
                      <View style={[styles.progressBar, { backgroundColor: c.border }]}>
                        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: c.green }]} />
                      </View>
                      <View style={styles.campaignStats}>
                        <Text style={[styles.campaignRaised, { color: c.green }]}>
                          ${Number(camp.raised).toLocaleString()} raised
                        </Text>
                        <Text style={[styles.campaignGoal, { color: c.textMuted }]}>
                          of ${Number(camp.goal).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomPad > 0 ? bottomPad : 16, backgroundColor: c.cardBg, borderTopColor: c.border }]}>
        <View style={styles.bottomBtnRow}>
          {(org.org_tier === "growth" || org.org_tier === "institutional") && (
            <Pressable
              style={[styles.volunteerBtn, { borderColor: c.green, backgroundColor: c.background }]}
              onPress={() => router.push({ pathname: "/volunteer/[orgId]", params: { orgId: org.id } })}
            >
              <Ionicons name="hand-left-outline" size={20} color={c.green} />
              <Text style={[styles.volunteerBtnText, { color: c.green }]}>Volunteer</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.donateBtn, { backgroundColor: c.green }]}
            onPress={() => router.push({ pathname: "/donate/[orgId]", params: { orgId: org.id } })}
          >
            <Text style={styles.donateBtnText}>Donate Now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontFamily: "Poppins_500Medium", fontSize: 16 },
  backText: { fontFamily: "Poppins_500Medium", fontSize: 14, marginTop: 8 },
  headerBg: { height: 140, width: SCREEN_WIDTH },
  headerImage: { height: 180, width: SCREEN_WIDTH },
  headerOverlay: { paddingHorizontal: 16 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  avatarWrap: { alignItems: "center", marginTop: -40 },
  body: { paddingHorizontal: 20, paddingTop: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 },
  orgName: { fontFamily: "Poppins_700Bold", fontSize: 22, textAlign: "center" },
  description: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 20 },
  statsRow: {
    flexDirection: "row", borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12,
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 16, marginBottom: 4 },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  statDivider: { width: 1, height: "100%" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderBottomWidth: 1, marginBottom: 16 },
  infoText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, marginBottom: 12 },
  campaignCard: { flexDirection: "row", borderRadius: 14, overflow: "hidden", marginBottom: 12, padding: 12, gap: 12 },
  campaignImage: { width: 80, height: 80, borderRadius: 10 },
  campaignBody: { flex: 1, justifyContent: "center" },
  campaignTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, marginBottom: 8 },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: 6, borderRadius: 3 },
  campaignStats: { flexDirection: "row", gap: 8 },
  campaignRaised: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  campaignGoal: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingTop: 12, paddingHorizontal: 20, borderTopWidth: 1,
  },
  bottomBtnRow: {
    flexDirection: "row",
    gap: 12,
    alignSelf: "stretch",
    width: "100%",
  },
  volunteerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    minHeight: 52,
  },
  volunteerBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  donateBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  donateBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFFFFF", textAlign: "center" },
});
