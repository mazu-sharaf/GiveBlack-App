import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  Share,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApp, type Campaign } from "@/context/AppContext";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import OrgAvatar from "@/components/OrgAvatar";
import { getApiUrl } from "@/lib/query-client";
import { getCampaignImage } from "@/constants/images";
import AppHeader from "@/components/AppHeader";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface CampaignDetail extends Campaign {
  gallery?: { id: string; image_url: string; caption?: string }[];
  orgDescription?: string;
  orgTier?: string;
}

function resolveImgUrl(base: string, url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function CampaignDetailScreen() {
  const { id, quick_amount } = useLocalSearchParams<{ id: string; quick_amount?: string }>();

  const prefilledAmount = (() => {
    const raw = Array.isArray(quick_amount) ? quick_amount[0] : quick_amount;
    if (!raw) return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const insets = useSafeInsets();
  const { campaigns, categories, isFavorite, toggleFavorite, setLastMeaningfulRoute } = useApp();
  const c = useThemeColors();
  const bottomPad = insets.bottom;

  const contextCampaign = campaigns.find((cp) => cp.id === id);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base}/api/campaigns/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCampaign({
          id: data.id,
          title: data.title,
          description: data.description,
          story: data.story,
          about: data.about,
          mainImageUrl: resolveImgUrl(base, data.main_image_url),
          location: data.location,
          goal: Number(data.goal ?? 0),
          raised: Number(data.raised ?? 0),
          donorCount: Number(data.donor_count ?? 0),
          status: data.status,
          organizationId: data.organization_id,
          orgName: data.org_name,
          orgImageUrl: resolveImgUrl(base, data.org_image_url),
          orgInitials: data.org_initials,
          orgImageColor: data.org_image_color,
          orgVerified: data.org_verified,
          categoryId: data.category_id,
          createdAt: data.created_at,
          gallery: (data.gallery || []).map((g: any) => ({ ...g, image_url: resolveImgUrl(base, g.image_url) })),
          orgDescription: data.org_description,
          orgTier: data.org_tier || "free",
        });
      }
    } catch {
      // fall back to context data
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Refetch when the screen is shown again (e.g. after donating) so raised/donor totals stay in sync with the API.
  useFocusEffect(
    useCallback(() => {
      fetchDetail();
      if (id) setLastMeaningfulRoute(`/campaign/${id}`);
    }, [fetchDetail, id, setLastMeaningfulRoute])
  );

  const camp = campaign || (contextCampaign ? { ...contextCampaign, gallery: [], orgDescription: undefined, orgTier: undefined } : null);
  const showVolunteer = camp?.orgTier === "growth" || camp?.orgTier === "institutional";

  if (loading && !contextCampaign) {
    return (
      <View style={[styles.notFound, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.green} />
      </View>
    );
  }

  if (!camp) {
    return (
      <View style={[styles.notFound, { backgroundColor: c.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={c.textMuted} />
        <Text style={[styles.notFoundText, { color: c.textMuted }]}>Campaign not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.green }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const pct = camp.goal > 0 ? Math.min((camp.raised / camp.goal) * 100, 100) : 0;
  const cat = categories.find((ct) => ct.id === camp.categoryId);
  const campIndex = campaigns.findIndex((cp) => cp.id === id);

  async function handleShare() {
    try {
      // Public campaign page URL for sharing
      const pubHost = process.env.EXPO_PUBLIC_DOMAIN || "giveblackapp.com";
      /** Public short URL: server-rendered OG tags at /c/:id (not /admin/c/, which only serves SPA shell to crawlers). */
      const shareUrl = `https://${pubHost}/c/${camp!.id}`;
      if (Platform.OS === "web" && typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share({
            title: camp!.title,
            text: `Support ${camp!.title} on GiveBlack!`,
            url: shareUrl,
          });
          return;
        } catch {
          // fallthrough
        }
      }
      await Share.share({
        message: `Support ${camp!.title} on GiveBlack! ${shareUrl}`,
        url: shareUrl,
        title: camp!.title,
      });
    } catch {
      // no-op
    }
  }

  const heroImage = camp.mainImageUrl
    ? { uri: camp.mainImageUrl }
    : getCampaignImage(campIndex >= 0 ? campIndex : 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="Campaign" showSearch={false} />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
      >
        <View style={styles.heroWrap}>
          <Image
            source={heroImage}
            style={styles.heroImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
          />
        </View>

        <View style={styles.body}>
          <Text style={[styles.campaignTitle, { color: c.text }]}>{camp.title}</Text>
          <Pressable
            style={styles.orgRow}
            onPress={() => router.push({ pathname: "/organization/[id]", params: { id: camp.organizationId } })}
          >
            <OrgAvatar
              imageUrl={camp.orgImageUrl}
              initials={camp.orgInitials}
              imageColor={camp.orgImageColor}
              size={28}
              fontSize={10}
            />
            <Text style={[styles.orgName, { color: c.textMuted }]}>{camp.orgName}</Text>
            {camp.orgVerified && <Ionicons name="checkmark-circle" size={16} color={c.green} />}
            <Ionicons name="chevron-forward" size={14} color={c.textMuted} />
          </Pressable>

          <View style={[styles.statsRow, { backgroundColor: c.cardBg }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: c.text }]}>
                ${camp.raised >= 1000 ? (camp.raised / 1000).toFixed(1) + "K" : camp.raised.toFixed(0)}
              </Text>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>Fund Raised</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: c.text }]}>
                ${camp.goal >= 1000 ? (camp.goal / 1000).toFixed(0) + "K" : camp.goal.toFixed(0)}
              </Text>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>Goal</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: c.text }]}>{camp.donorCount}</Text>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>Donors</Text>
            </View>
          </View>

          {camp.status === "completed" && (
            <View style={[styles.completedBanner, { backgroundColor: c.green + "15" }]}>
              <Ionicons name="checkmark-circle" size={20} color={c.green} />
              <Text style={[styles.completedText, { color: c.green }]}>Campaign Goal Reached</Text>
            </View>
          )}

          <View style={styles.progressSection}>
            <View style={[styles.progressBar, { backgroundColor: c.border }]}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: camp.status === "completed" ? c.green : c.green }]} />
            </View>
            <Text style={[styles.progressPct, { color: c.green }]}>{pct.toFixed(0)}%</Text>
          </View>

          {camp.donorCount > 0 && (
            <View style={styles.donorsRow}>
              <View style={styles.donorAvatars}>
                {Array.from({ length: Math.min(camp.donorCount, 4) }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.donorAvatar,
                      { marginLeft: i > 0 ? -8 : 0 },
                      { backgroundColor: ["#4CAF50", "#2196F3", "#FF9800", "#9C27B0"][i] },
                      { borderColor: c.background },
                    ]}
                  >
                    <Ionicons name="person" size={12} color={Colors.white} />
                  </View>
                ))}
              </View>
              <Text style={[styles.donorCountText, { color: c.textMuted }]}>{camp.donorCount} people donated</Text>
            </View>
          )}

          <View style={styles.tagsRow}>
            {cat && (
              <View style={[styles.tag, { backgroundColor: c.cardBg }]}>
                <Ionicons name="pricetag-outline" size={14} color={c.green} />
                <Text style={[styles.tagText, { color: c.textMuted }]}>{cat.name}</Text>
              </View>
            )}
            {camp.location && (
              <View style={[styles.tag, { backgroundColor: c.cardBg }]}>
                <Ionicons name="location-outline" size={14} color={c.green} />
                <Text style={[styles.tagText, { color: c.textMuted }]}>{camp.location}</Text>
              </View>
            )}
          </View>

          {camp.story && (
            <>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Story</Text>
              <Text style={[styles.storyText, { color: c.textMuted }]}>{camp.story}</Text>
            </>
          )}
          {!camp.story && camp.description && (
            <>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Story</Text>
              <Text style={[styles.storyText, { color: c.textMuted }]}>{camp.description}</Text>
            </>
          )}

          {campaign?.gallery && campaign.gallery.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryRow}>
              {campaign.gallery.map((img) => (
                <Image
                  key={img.id}
                  source={{ uri: img.image_url }}
                  style={styles.galleryImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={img.id}
                  transition={200}
                  placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                />
              ))}
            </ScrollView>
          )}

          {!campaign?.gallery?.length && (
            <View style={styles.storyImageWrap}>
              <Image
                source={getCampaignImage((campIndex + 1) % 6)}
                style={styles.storyImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
              />
            </View>
          )}

          {camp.about && (
            <>
              <Text style={[styles.sectionTitle, { color: c.text }]}>About {camp.orgName}</Text>
              <Text style={[styles.storyText, { color: c.textMuted }]}>{camp.about}</Text>
            </>
          )}
          {!camp.about && campaign?.orgDescription && (
            <>
              <Text style={[styles.sectionTitle, { color: c.text }]}>About {camp.orgName}</Text>
              <Text style={[styles.storyText, { color: c.textMuted }]}>{campaign.orgDescription}</Text>
            </>
          )}

          <View style={styles.aboutStatsRow}>
            <View style={[styles.aboutStatCard, { backgroundColor: c.cardBg }]}>
              <Text style={[styles.aboutStatValue, { color: c.text }]}>
                ${camp.raised >= 1000 ? (camp.raised / 1000).toFixed(1) + "K" : camp.raised.toFixed(0)}
              </Text>
              <Text style={[styles.aboutStatLabel, { color: c.textMuted }]}>Fund Raised</Text>
            </View>
            <View style={[styles.aboutStatCard, { backgroundColor: c.cardBg }]}>
              <Text style={[styles.aboutStatValue, { color: c.text }]}>{camp.donorCount}</Text>
              <Text style={[styles.aboutStatLabel, { color: c.textMuted }]}>People donated</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomPad > 0 ? bottomPad : 16, backgroundColor: c.cardBg, borderTopColor: c.border }]}>
        {camp.status === "completed" ? (
          <View style={[styles.completedBottomBar, { backgroundColor: c.green + "15" }]}>
            <Ionicons name="checkmark-circle" size={22} color={c.green} />
            <Text style={[styles.completedBottomText, { color: c.green }]}>This campaign has been fully funded</Text>
          </View>
        ) : (
          <View style={styles.bottomBtnRow}>
            {showVolunteer && (
              <Pressable
                style={[styles.volunteerBtn, { borderColor: c.green, backgroundColor: c.background }]}
                onPress={() =>
                  router.push({
                    pathname: "/volunteer/[orgId]",
                    params: { orgId: camp.organizationId },
                  })
                }
              >
                <Ionicons name="hand-left-outline" size={20} color={c.green} />
                <Text style={[styles.volunteerBtnText, { color: c.green }]}>Volunteer</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.donateBtn, { backgroundColor: c.green }]}
              onPress={() =>
                router.push({
                  pathname: "/donate/[orgId]",
                  params: {
                    orgId: camp.organizationId,
                    campaignId: id,
                    ...(prefilledAmount ? { amount: String(prefilledAmount) } : {}),
                  },
                })
              }
            >
              <Text style={styles.donateBtnText}>Donate Now</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View
        style={[
          styles.stickyBar,
          {
            paddingTop: insets.top + 8,
            backgroundColor: "transparent",
            pointerEvents: "box-none",
          },
        ]}
      >
        <Pressable style={styles.heroBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.primary} />
        </Pressable>
        <View style={styles.heroRight}>
          <Pressable style={styles.heroBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={Colors.primary} />
          </Pressable>
          <Pressable
            style={styles.heroBtn}
            onPress={() => toggleFavorite(camp.id)}
          >
            <Ionicons
              name={isFavorite(camp.id) ? "heart" : "heart-outline"}
              size={20}
              color={isFavorite(camp.id) ? c.green : Colors.primary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  stickyBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  heroWrap: { width: SCREEN_WIDTH, height: 280, position: "relative" },
  heroImage: { width: "100%", height: "100%" },
  heroBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  heroRight: { flexDirection: "row", gap: 8 },
  body: { paddingHorizontal: 20, paddingTop: 20 },
  campaignTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20, lineHeight: 28, marginBottom: 12 },
  orgRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  orgName: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 14 },
  statsRow: {
    flexDirection: "row", borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12,
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, marginBottom: 4 },
  statLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11 },
  statDivider: { width: 1, height: "100%" },
  progressSection: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  progressBar: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  progressPct: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  donorsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  donorAvatars: { flexDirection: "row" },
  donorAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 2,
  },
  donorCountText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tagText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 12 },
  sectionTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 18, marginBottom: 12 },
  storyText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, lineHeight: 22, marginBottom: 20 },
  storyImageWrap: { borderRadius: 14, overflow: "hidden", marginBottom: 24, height: 180 },
  storyImage: { width: "100%", height: "100%" },
  galleryRow: { marginBottom: 24 },
  galleryImage: { width: 240, height: 160, borderRadius: 14, marginRight: 12 },
  aboutStatsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  aboutStatCard: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  aboutStatValue: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, marginBottom: 4 },
  aboutStatLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12 },
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
  volunteerBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  donateBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  donateBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16, color: Colors.white, textAlign: "center" },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  notFoundText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 16 },
  backLink: { marginTop: 8 },
  backLinkText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 14 },
  completedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 16,
  },
  completedText: {
    fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14,
  },
  completedBottomBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16, borderRadius: 14,
  },
  completedBottomText: {
    fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14,
  },
});
