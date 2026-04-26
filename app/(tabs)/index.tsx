import React, { useCallback } from "react";
import {
  Alert,
  BackHandler,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { getPreferredDisplayName } from "@/lib/user-display";

const PADDING_H = 20;

import { getCampaignImage } from "@/constants/images";
import HeroSection from "@/components/ui/HeroSection";
import SummaryCard from "@/components/ui/SummaryCard";
import SearchBar from "@/components/ui/SearchBar";
import CampaignCard from "@/components/ui/CampaignCard";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const {
    totalDonated,
    organizations,
    campaigns,
    categories,
    walletBalance,
    isFavorite,
    toggleFavorite,
    isOffline,
    refresh,
    userProfile,
  } = useApp();
  const { user, isGuest, logout, guestLogin, avatarUrl, donationSummary } = useAuth();
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const CARD_WIDTH = Math.min(screenWidth * 0.7, 300);
  const LATEST_CARD_WIDTH = (screenWidth - PADDING_H * 2 - 14) / 2;

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const exitConfirmShownRef = React.useRef(false);

  const showExitConfirmation = useCallback(() => {
    if (exitConfirmShownRef.current) return;
    exitConfirmShownRef.current = true;

    Alert.alert(
      "Exit GiveBlack?",
      "Do you want to exit the app?",
      [
        {
          text: "No",
          style: "cancel",
          onPress: () => {
            exitConfirmShownRef.current = false;
          },
        },
        {
          text: "Yes",
          style: "destructive",
          onPress: () => {
            exitConfirmShownRef.current = false;
            // On iOS there isn't a true "exit app" pattern, but we try anyway.
            const maybeExit = (BackHandler as any)?.exitApp;
            if (typeof maybeExit === "function") maybeExit();
          },
        },
      ],
      { cancelable: true }
    );
  }, []);

  // UX: When on the Home tab, prevent back navigation to login/welcome.
  // Instead, show an exit confirmation. Works for Android hardware back,
  // and iOS navigation back gestures (via beforeRemove where available).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        showExitConfirmation();
        return true; // prevent default back behavior
      });

      const unsubscribeBeforeRemove = (() => {
        try {
          return navigation?.addListener?.("beforeRemove", (e: any) => {
            e?.preventDefault?.();
            showExitConfirmation();
          });
        } catch {
          return undefined;
        }
      })();

      return () => {
        sub.remove();
        if (typeof unsubscribeBeforeRemove === "function") unsubscribeBeforeRemove();
      };
    }, [navigation, showExitConfirmation])
  );
  
  const isEmpty = campaigns.length === 0 && categories.length === 0;
  const [search, setSearch] = React.useState("");
  const filteredCampaigns = React.useMemo(() => {
    if (!search.trim()) return campaigns;
    return campaigns.filter((c) => (c.title || "").toLowerCase().includes(search.toLowerCase()));
  }, [campaigns, search]);
  const featuredCampaigns = filteredCampaigns.slice(0, 4);
  const latest = filteredCampaigns.slice(0, 6);

  const bottomPad = insets.bottom;

  const rawName = getPreferredDisplayName(userProfile.fullName as string | undefined, user?.email, "").trim();
  const derivedFromName = rawName ? rawName.split(" ")[0] : "";
  const derivedFromEmail = !derivedFromName && user?.email ? user.email.split("@")[0] : "";
  const firstName = derivedFromName || derivedFromEmail || "Friend";
  const avatarInitial = firstName[0]?.toUpperCase() || "F";
  
  // Create category map for lookup
  const categoryMap = React.useMemo(() => {
    const map: Record<string, any> = {};
    categories.forEach(cat => {
      map[cat.id] = cat;
    });
    return map;
  }, [categories]);

  const renderCampaignCard = useCallback((camp: any, i: number) => {
    return (
      <CampaignCard
        key={camp.id}
        id={camp.id}
        title={camp.title}
        orgName={camp.orgName || categories.find((ct) => ct.id === camp.categoryId)?.name || "Charity"}
        mainImageUrl={camp.mainImageUrl}
        raised={camp.raised}
        goal={camp.goal}
        donors={camp.donorCount}
        index={i}
        isFavorite={isFavorite(camp.id)}
        onToggleFavorite={() => toggleFavorite(camp.id)}
        onPress={() =>
          router.push({
            pathname: "/campaign/[id]",
            params: { id: camp.id },
          })
        }
        style={{ width: CARD_WIDTH }}
      />
    );
  }, [isFavorite, toggleFavorite, c, categories, router]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 10, paddingBottom: bottomPad + 100 },
        ]}
      >
        <HeroSection>
          <View style={styles.heroHeaderRow}>
            <View>
              <Text style={[styles.heroGreeting, { color: "#FFFFFF" }]}>
                Good {new Date().getHours() < 12 ? "morning" : "evening"},{" "}
                {firstName}
              </Text>
              <Text style={[styles.heroSub, { color: "#E3FCEF" }]}>
                Thank you for supporting Black philanthropy
              </Text>
            </View>
            <View style={[styles.avatar, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <Text style={styles.avatarText}>{avatarInitial}</Text>
            </View>
          </View>
          <SummaryCard
            label="Total donated"
            amount={
              donationSummary
                ? `$${(donationSummary.total_amount_cents / 100).toFixed(2)}`
                : `$${totalDonated.toFixed(2)}`
            }
            secondaryLabel={donationSummary?.rank ? "Global rank" : undefined}
            secondaryValue={donationSummary?.rank ? `#${donationSummary.rank}` : undefined}
            primaryLabel="Browse campaigns"
            onPrimaryAction={() => router.push("/all-campaigns")}
            secondaryActionLabel="View impact"
            onSecondaryAction={() => router.push("/(account)/impact")}
            style={{ marginTop: 16 }}
          />
        </HeroSection>

        {isOffline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color="#7B6100" />
            <Text style={styles.offlineText}>Offline - Showing saved data</Text>
          </View>
        )}

        {isGuest && (
          <Pressable
            style={[styles.guestBanner, { backgroundColor: c.green + "15", borderColor: c.green + "40" }]}
            onPress={async () => {
              await logout();
              router.replace('/(auth)/welcome');
            }}
          >
            <Ionicons name="person-add-outline" size={20} color={c.green} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.guestBannerTitle, { color: c.text }]}>Create Your Account</Text>
              <Text style={[styles.guestBannerDesc, { color: c.textMuted }]}>Sign up to donate, save favorites, and track your impact</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.green} />
          </Pressable>
        )}

        {isEmpty && !isOffline && (
          <View style={[styles.emptyState, { backgroundColor: c.cardBg }]}>
            <Ionicons name="heart-outline" size={40} color={c.textMuted} />
            <Text style={[styles.emptyStateTitle, { color: c.text }]}>No campaigns yet</Text>
            <Text style={[styles.emptyStateDesc, { color: c.textMuted }]}>Pull down to refresh and discover organizations making a difference</Text>
          </View>
        )}
        <View style={{ marginTop: 16, marginBottom: 16 }}>
          <SearchBar
            placeholder="Search campaigns..."
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch("")}
          />
        </View>

        {/* Wallet/top-up card removed per latest design */}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Feature Campaign</Text>
          <Pressable onPress={() => router.push("/all-campaigns")}>
            <Text style={[styles.seeAll, { color: c.green }]}>See all</Text>
          </Pressable>
        </View>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredRow}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + 16}
        >
          {featuredCampaigns.map((camp, i) => {
            return renderCampaignCard(camp, i);
          })}
        </Animated.ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Categories</Text>
          <Pressable onPress={() => router.push("/(tabs)/categories")}>
            <Text style={[styles.seeAll, { color: c.green }]}>See all</Text>
          </Pressable>
        </View>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              style={[styles.categoryPill, { backgroundColor: c.cardBg, borderColor: c.border }]}
              onPress={() =>
                router.push({
                  pathname: "/category/[id]",
                  params: { id: cat.id },
                })
              }
            >
              <Text style={[styles.categoryPillText, { color: c.text }]}>{cat.name}</Text>
            </Pressable>
          ))}
        </Animated.ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Latest Campaign</Text>
          <Pressable onPress={() => router.push("/all-campaigns")}>
            <Text style={[styles.seeAll, { color: c.green }]}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.latestGrid}>
          {latest.map((camp, i) => {
            const pct = camp.goal > 0 ? Math.min((camp.raised / camp.goal) * 100, 100) : 0;
            return (
              <Pressable
                key={camp.id}
                style={[styles.latestCard, { width: LATEST_CARD_WIDTH, backgroundColor: c.cardBg, shadowColor: c.cardShadow }]}
                onPress={() =>
                  router.push({
                    pathname: "/campaign/[id]",
                    params: { id: camp.id },
                  })
                }
              >
                <View style={styles.latestImageWrap}>
                  <Image
                    source={camp.mainImageUrl ? { uri: camp.mainImageUrl } : getCampaignImage(i)}
                    style={styles.latestImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={camp.id}
                    transition={200}
                    placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                  />
                  <Pressable
                    style={styles.heartBtnSmall}
                    onPress={(e) => {
                      e.stopPropagation();
                      toggleFavorite(camp.id);
                    }}
                  >
                    <Ionicons
                      name={isFavorite(camp.id) ? "heart" : "heart-outline"}
                      size={14}
                      color={isFavorite(camp.id) ? c.green : "#FFFFFF"}
                    />
                  </Pressable>
                </View>
                <Text style={[styles.latestName, { color: c.text }]} numberOfLines={2}>
                  {camp.title}
                </Text>
                <View style={[styles.progressBarSmall, { backgroundColor: c.border }]}>
                  <View
                    style={[
                      styles.progressFillSmall,
                      { width: `${pct}%`, backgroundColor: c.green },
                    ]}
                  />
                </View>
                <Text style={[styles.latestPct, { color: c.green }]}>{pct.toFixed(0)}% raised</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  profileCard: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  profileLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.white,
  },
  profileAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  profileName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  profileEmail: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  profileRank: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    marginTop: 2,
  },
  profileImpactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 12,
  },
  profileImpactText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroGreeting: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
  },
  heroSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 4,
  },
  greeting: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.primary,
  },
  donatedLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  donatedAmount: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.green,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  notifDot: {
    position: "absolute",
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  walletCard: {
    backgroundColor: Colors.green,
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  walletLeft: {
    flex: 1,
  },
  walletLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 4,
  },
  walletBalance: {
    fontFamily: "Poppins_700Bold",
    fontSize: 36,
    color: Colors.white,
    lineHeight: 42,
  },
  walletRight: {
    alignItems: "center",
    gap: 10,
  },
  walletIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  topUpBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 4,
  },
  topUpText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.green,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.primary,
  },
  seeAll: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.green,
  },
  featuredRow: {
    paddingBottom: 20,
    paddingRight: 20,
    gap: 16,
  },
  featuredCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  featuredImageWrap: {
    width: "100%",
    height: 160,
    position: "relative",
  },
  featuredImage: {
    width: "100%",
    height: "100%",
  },
  heartBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  featuredBody: {
    padding: 14,
  },
  featuredName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
    marginBottom: 2,
  },
  featuredOrg: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  progressBar: {
    height: 6,
    backgroundColor: "#E8E8E8",
    borderRadius: 3,
    marginBottom: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: Colors.green,
    borderRadius: 3,
  },
  featuredStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  featuredPct: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.green,
  },
  featuredDonors: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  pillRow: {
    paddingBottom: 20,
    gap: 8,
  },
  categoryPill: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryPillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primary,
  },
  latestGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  latestCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  latestImageWrap: {
    width: "100%",
    height: 110,
    position: "relative",
  },
  latestImage: {
    width: "100%",
    height: "100%",
  },
  heartBtnSmall: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  latestName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
    paddingHorizontal: 10,
    paddingTop: 8,
    lineHeight: 18,
  },
  progressBarSmall: {
    height: 4,
    backgroundColor: "#E8E8E8",
    borderRadius: 2,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 6,
    overflow: "hidden",
  },
  progressFillSmall: {
    height: 4,
    backgroundColor: Colors.green,
    borderRadius: 2,
  },
  latestPct: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.green,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    paddingRight: 12,
    fontFamily: "Poppins_400Regular",
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFF8E1",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  offlineText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#7B6100",
  },
  guestBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  guestBannerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  guestBannerDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    margin: 20,
    padding: 32,
    borderRadius: 16,
    gap: 10,
  },
  emptyStateTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
  },
  emptyStateDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
