import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  AppState,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getCampaignImage } from "@/constants/images";
import OrgAvatar from "@/components/OrgAvatar";

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export default function CommunityTabScreen() {
  const c = useThemeColors();
  const { user } = useAuth();
  const insets = useSafeInsets();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [orgsInCategory, setOrgsInCategory] = useState<any[]>([]);

  const baseUrl = getApiUrl();

  function resolveUrl(url?: string | null): string | null {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${baseUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  const load = useCallback(async () => {
    try {
      const orgFetch = categoryId
        ? fetch(`${baseUrl}api/organizations/category/${encodeURIComponent(categoryId)}`)
        : Promise.resolve(null);
      const [campRes, catRes, orgRes] = await Promise.all([
        fetch(`${baseUrl}api/campaigns${categoryId ? `?category_id=${categoryId}` : ""}`),
        fetch(`${baseUrl}api/categories`),
        orgFetch,
      ]);
      const campData = await campRes.json();
      const catData = catRes.ok ? await catRes.json() : {};
      setCampaigns(Array.isArray(campData) ? campData : []);
      const catList = Array.isArray(catData) ? catData : (catData.categories || []);
      setCategories(catList);
      if (categoryId && orgRes && orgRes.ok) {
        const orgData = await orgRes.json();
        setOrgsInCategory(Array.isArray(orgData) ? orgData : []);
      } else {
        setOrgsInCategory([]);
      }
    } catch {
      setCampaigns([]);
      setCategories([]);
      setOrgsInCategory([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [baseUrl, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  // If admin adds/changes categories while this app stays open in the background,
  // we refresh when the app becomes active again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") load();
    });
    return () => sub.remove();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const filteredCampaigns = useMemo(() => {
    if (!searchQuery.trim()) return campaigns;
    const q = searchQuery.trim().toLowerCase();
    return campaigns.filter(
      (camp: any) =>
        (camp.title || "").toLowerCase().includes(q) ||
        (camp.org_name || "").toLowerCase().includes(q) ||
        (camp.category_name || "").toLowerCase().includes(q)
    );
  }, [campaigns, searchQuery]);

  const bottomPad = insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.headerSticky, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Community Fundraising</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>Support campaigns by the community</Text>
        <View style={[styles.searchWrap, { backgroundColor: c.cardBg }]}>
          <Ionicons name="search-outline" size={20} color={c.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search campaigns..."
            placeholderTextColor={c.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8} style={styles.searchClear}>
              <Ionicons name="close-circle" size={20} color={c.textMuted} />
            </Pressable>
          )}
        </View>

        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
            <Pressable
              style={[styles.catChip, categoryId === "" ? { backgroundColor: c.green } : { backgroundColor: c.cardBg }]}
              onPress={() => setCategoryId("")}
            >
              <Text style={[styles.catChipText, { color: categoryId === "" ? "#fff" : c.text }]}>All</Text>
            </Pressable>
            {categories.map((cat: any) => (
              <Pressable
                key={cat.id}
                style={[styles.catChip, categoryId === cat.id ? { backgroundColor: c.green } : { backgroundColor: c.cardBg }]}
                onPress={() => setCategoryId(cat.id)}
              >
                <Text style={[styles.catChipText, { color: categoryId === cat.id ? "#fff" : c.text }]}>{cat.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {user?.type === "charity" && (
          <Pressable
            style={[styles.createBtn, { backgroundColor: c.green }]}
            onPress={() => router.push("/community/create")}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.createBtnText}>Start a campaign</Text>
          </Pressable>
        )}

        {categoryId.length > 0 && orgsInCategory.length > 0 && (
          <View style={styles.orgSection}>
            <Text style={[styles.orgSectionTitle, { color: c.text }]}>Organizations in this category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.orgScrollContent}
            >
              {orgsInCategory.map((org: any) => (
                <Pressable
                  key={org.id}
                  style={[styles.orgChip, { backgroundColor: c.cardBg, borderColor: c.border }]}
                  onPress={() => router.push({ pathname: "/organization/[id]", params: { id: org.id } })}
                >
                  <OrgAvatar
                    imageUrl={resolveUrl(org.image_url) || undefined}
                    initials={orgInitials(String(org.name || ""))}
                    imageColor={c.green}
                    size={40}
                    fontSize={12}
                  />
                  <Text style={[styles.orgChipName, { color: c.text }]} numberOfLines={2}>
                    {org.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={c.green} />
          </View>
        ) : filteredCampaigns.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={c.textMuted} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              {searchQuery.trim()
                ? "No campaigns match your search"
                : categoryId && orgsInCategory.length > 0
                  ? "No campaigns in this category yet"
                  : "No community campaigns yet"}
            </Text>
            {user?.type === "charity" && (
              <Pressable style={[styles.createBtnSmall, { borderColor: c.green }]} onPress={() => router.push("/community/create")}>
                <Text style={[styles.createBtnSmallText, { color: c.green }]}>Create one</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.list}>
            {filteredCampaigns.map((camp, index) => {
              const goal = Number(camp.goal ?? 0);
              const raised = Number(camp.raised ?? 0);
              const pct = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;
              const catName = camp.category_name || "";
              const imageUrl = resolveUrl(camp.main_image_url);
              const imageSource = imageUrl ? { uri: imageUrl } : getCampaignImage(index);
              return (
                <Pressable
                  key={camp.id}
                  style={[styles.card, { backgroundColor: c.cardBg }]}
                  onPress={() => router.push({ pathname: "/campaign/[id]", params: { id: camp.id } })}
                >
                  <Image source={imageSource} style={styles.cardImage} contentFit="cover" cachePolicy="memory-disk" recyclingKey={camp.id} transition={200} placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }} />
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>{camp.title}</Text>
                    {camp.org_name ? <Text style={[styles.cardCategory, { color: c.textMuted }]}>{camp.org_name}</Text> : null}
                    {catName ? <Text style={[styles.cardCategory, { color: c.textMuted }]}>{catName}</Text> : null}
                    <View style={styles.progressWrap}>
                      <View style={[styles.progressBg, { backgroundColor: c.surface }]}>
                        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: c.green }]} />
                      </View>
                      <Text style={[styles.progressText, { color: c.textMuted }]}>
                        ${raised.toLocaleString()} of ${goal.toLocaleString()} · {camp.donor_count ?? 0} donors
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSticky: { paddingHorizontal: 20, paddingBottom: 16 },
  scroll: { flex: 1 },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 14, marginTop: 4 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  searchClear: { padding: 4 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    marginVertical: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  catScroll: { marginTop: 4 },
  catScrollContent: { paddingRight: 20, gap: 8, flexDirection: "row" },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  catChipText: { fontSize: 14, fontWeight: "500" },
  loadingWrap: { padding: 40, alignItems: "center" },
  empty: { padding: 40, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 16 },
  createBtnSmall: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  createBtnSmallText: { fontWeight: "600" },
  list: { paddingHorizontal: 20, gap: 16, paddingBottom: 20 },
  card: { borderRadius: 14, overflow: "hidden" },
  cardImage: { width: "100%", height: 180 },
  cardBody: { padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardCategory: { fontSize: 12, marginTop: 4 },
  progressWrap: { marginTop: 10 },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 12, marginTop: 6 },
  orgSection: { marginHorizontal: 20, marginBottom: 8 },
  orgSectionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 10 },
  orgScrollContent: { gap: 10, paddingRight: 20 },
  orgChip: {
    width: 112,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  orgChipName: { fontSize: 12, fontWeight: "500", textAlign: "center" },
});
