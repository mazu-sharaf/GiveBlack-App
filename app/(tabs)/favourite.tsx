import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  Modal,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";

import { getCampaignImage, campaignImages } from "@/constants/images";

type SortOption = "default" | "name_az" | "name_za" | "raised_high" | "raised_low";

export default function FavouriteScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { isDark } = useTheme();
  const { campaigns, categories, favorites, toggleFavorite } = useApp();
  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("default");

  const bottomPad = insets.bottom;

  const activeFilterCount = (selectedCategory ? 1 : 0) + (sortBy !== "default" ? 1 : 0);

  const campIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    campaigns.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [campaigns]);

  const favoriteCampaigns = useMemo(() => {
    let items = campaigns.filter((c) => favorites.includes(c.id));
    if (search.trim()) {
      items = items.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(search.toLowerCase()) ||
          (c.description || "").toLowerCase().includes(search.toLowerCase())
      );
    }
    if (selectedCategory) {
      items = items.filter((c) => c.categoryId === selectedCategory);
    }
    switch (sortBy) {
      case "name_az":
        items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "name_za":
        items.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        break;
      case "raised_high":
        items.sort((a, b) => b.raised - a.raised);
        break;
      case "raised_low":
        items.sort((a, b) => a.raised - b.raised);
        break;
    }
    return items;
  }, [campaigns, favorites, search, selectedCategory, sortBy]);

  const sortOptions: { key: SortOption; label: string }[] = [
    { key: "default", label: "Default" },
    { key: "name_az", label: "Name (A-Z)" },
    { key: "name_za", label: "Name (Z-A)" },
    { key: "raised_high", label: "Most raised" },
    { key: "raised_low", label: "Least raised" },
  ];

  const chipBg = isDark ? "#2A2A2A" : "#F1F1F1";
  const sortBorderColor = isDark ? "#333" : "#F5F5F5";

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.searchRow}>
        <View style={[styles.searchWrap, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Ionicons name="search" size={18} color={c.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search favorites..."
            placeholderTextColor={c.textLight}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={c.textLight} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[styles.filterBtn, { backgroundColor: activeFilterCount > 0 ? c.green : c.cardBg, borderColor: activeFilterCount > 0 ? c.green : c.border }]}
          onPress={() => setShowFilter(true)}
        >
          <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? "#FFFFFF" : c.text} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={64} color={c.border} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>No favorites yet</Text>
          <Text style={[styles.emptySub, { color: c.textMuted }]}>
            Tap the heart icon on campaigns to add them here
          </Text>
        </View>
      ) : favoriteCampaigns.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color={c.border} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>No results found</Text>
          <Text style={[styles.emptySub, { color: c.textMuted }]}>Try a different search or filter</Text>
        </View>
      ) : (
        <FlatList
          data={favoriteCampaigns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const originalIndex = campIndexMap.get(item.id) ?? 0;
            const pct = item.goal > 0 ? Math.min((item.raised / item.goal) * 100, 100) : 0;
            return (
              <Pressable
                style={[styles.resultCard, { backgroundColor: c.cardBg }]}
                onPress={() =>
                  router.push({
                    pathname: "/campaign/[id]",
                    params: { id: item.id },
                  })
                }
              >
                <Image
                  source={item.mainImageUrl ? { uri: item.mainImageUrl } : campaignImages[originalIndex % 6]}
                  style={styles.resultImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={item.id}
                  transition={200}
                  placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                />
                <View style={styles.resultContent}>
                  <Text style={[styles.resultName, { color: c.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={[styles.resultOrg, { color: c.textMuted }]} numberOfLines={1}>
                    {item.orgName || "Charity"}
                  </Text>
                  <View style={[styles.progressBar, { backgroundColor: isDark ? "#333" : "#E8E8E8" }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${pct}%`, backgroundColor: c.green },
                      ]}
                    />
                  </View>
                  <Text style={[styles.resultPct, { color: c.green }]}>{pct.toFixed(0)}% raised</Text>
                </View>
                <Pressable
                  style={styles.heartBtn}
                  onPress={() => toggleFavorite(item.id)}
                >
                  <Ionicons name="heart" size={20} color={c.green} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}

      <Modal
        visible={showFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilter(false)}
      >
        <Pressable style={[styles.modalOverlay, { backgroundColor: c.modalOverlay }]} onPress={() => setShowFilter(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: c.cardBg }]} onPress={() => {}}>
            <View style={[styles.modalHandle, { backgroundColor: c.border }]} />

            <Text style={[styles.modalTitle, { color: c.text }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
              <Pressable
                style={[styles.chip, { backgroundColor: !selectedCategory ? c.green : chipBg }]}
                onPress={() => setSelectedCategory("")}
              >
                <Text style={[styles.chipText, { color: !selectedCategory ? "#FFFFFF" : c.text }]}>All</Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[styles.chip, { backgroundColor: selectedCategory === cat.id ? c.green : chipBg }]}
                  onPress={() => setSelectedCategory(selectedCategory === cat.id ? "" : cat.id)}
                >
                  <Text style={[styles.chipText, { color: selectedCategory === cat.id ? "#FFFFFF" : c.text }]}>{cat.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.modalTitle, { marginTop: 20, color: c.text }]}>Sort By</Text>
            {sortOptions.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.sortOption, { borderBottomColor: sortBorderColor }]}
                onPress={() => setSortBy(opt.key)}
              >
                <Text style={[styles.sortOptionText, { color: sortBy === opt.key ? c.green : c.text }, sortBy === opt.key && styles.sortOptionActive]}>{opt.label}</Text>
                <View style={[styles.radio, { borderColor: sortBy === opt.key ? c.green : c.border }]}>
                  {sortBy === opt.key && <View style={[styles.radioDot, { backgroundColor: c.green }]} />}
                </View>
              </Pressable>
            ))}

            <View style={styles.modalBtnRow}>
              <Pressable style={[styles.resetBtn, { borderColor: c.border }]} onPress={() => { setSelectedCategory(""); setSortBy("default"); }}>
                <Text style={[styles.resetBtnText, { color: c.text }]}>Reset</Text>
              </Pressable>
              <Pressable style={[styles.applyBtn, { backgroundColor: c.green }]} onPress={() => setShowFilter(false)}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 12,
  },
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  resultCard: {
    borderRadius: 14,
    flexDirection: "row",
    padding: 10,
    gap: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  resultImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  resultContent: {
    flex: 1,
  },
  resultName: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  resultOrg: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginBottom: 6,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  resultPct: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
  },
  heartBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 100,
  },
  emptyTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    marginTop: 8,
  },
  emptySub: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    maxHeight: "80%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    marginBottom: 12,
  },
  chipScroll: {
    maxHeight: 44,
  },
  chipRow: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sortOptionText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
  },
  sortOptionActive: {
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    borderWidth: 1.5,
  },
  resetBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  applyBtn: {
    flex: 1,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
});
