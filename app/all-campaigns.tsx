import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Dimensions,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";
import AppHeader from "@/components/AppHeader";

import { getCampaignImage, campaignImages } from "@/constants/images";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type SortOption = "default" | "name_az" | "name_za" | "raised_high" | "raised_low";

export default function AllCampaignsScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { campaigns, categories, toggleFavorite, isFavorite, setLastMeaningfulRoute } = useApp();

  useFocusEffect(
    useCallback(() => {
      setLastMeaningfulRoute("/all-campaigns");
    }, [setLastMeaningfulRoute])
  );
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

  const filtered = useMemo(() => {
    let results = [...campaigns];
    if (search.trim()) {
      results = results.filter((c) =>
        (c.title || "").toLowerCase().includes(search.toLowerCase())
      );
    }
    if (selectedCategory) {
      results = results.filter((c) => c.categoryId === selectedCategory);
    }
    switch (sortBy) {
      case "name_az":
        results.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "name_za":
        results.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        break;
      case "raised_high":
        results.sort((a, b) => b.raised - a.raised);
        break;
      case "raised_low":
        results.sort((a, b) => a.raised - b.raised);
        break;
    }
    return results;
  }, [search, campaigns, selectedCategory, sortBy]);

  const sortOptions: { key: SortOption; label: string }[] = [
    { key: "default", label: "Default" },
    { key: "name_az", label: "Name (A-Z)" },
    { key: "name_za", label: "Name (Z-A)" },
    { key: "raised_high", label: "Most raised" },
    { key: "raised_low", label: "Least raised" },
  ];

  const chipBg = c.inputBg;
  const sortBorderColor = c.border;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="All Campaigns" showSearch={false} />
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={18} color={c.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search campaigns..."
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
        <Pressable
          style={[styles.filterBtn, { backgroundColor: activeFilterCount > 0 ? c.green : c.cardBg, borderColor: activeFilterCount > 0 ? c.green : c.border }]}
          onPress={() => setShowFilter(true)}
        >
          <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? Colors.white : c.text} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPad + 30 },
        ]}
      >
        {filtered.map((camp) => {
          const pct = camp.goal > 0 ? Math.min((camp.raised / camp.goal) * 100, 100) : 0;
          const originalIndex = campIndexMap.get(camp.id) ?? 0;
          return (
            <Pressable
              key={camp.id}
              style={[styles.card, { backgroundColor: c.cardBg }]}
              onPress={() =>
                router.push({
                  pathname: "/campaign/[id]",
                  params: { id: camp.id },
                })
              }
            >
              <View style={styles.cardImageWrap}>
                <Image
                  source={camp.mainImageUrl ? { uri: camp.mainImageUrl } : campaignImages[originalIndex % 6]}
                  style={styles.cardImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={camp.id}
                  transition={200}
                  placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                />
                <Pressable
                  style={styles.heartBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    toggleFavorite(camp.id);
                  }}
                >
                  <Ionicons
                    name={isFavorite(camp.id) ? "heart" : "heart-outline"}
                    size={18}
                    color={isFavorite(camp.id) ? c.green : Colors.white}
                  />
                </Pressable>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.nameRow}>
                  <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>
                    {camp.title}
                  </Text>
                  {camp.orgVerified && (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={c.green}
                    />
                  )}
                </View>
                <Text style={[styles.goalText, { color: c.textMuted, marginBottom: 8 }]} numberOfLines={1}>
                  {camp.orgName}
                </Text>
                <View style={[styles.progressBar, { backgroundColor: c.progressBarBg }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${pct}%`, backgroundColor: c.green },
                    ]}
                  />
                </View>
                <View style={styles.statsRow}>
                  <Text style={[styles.raisedText, { color: c.text }]}>
                    ${camp.raised.toLocaleString()}{" "}
                    <Text style={[styles.goalText, { color: c.textMuted }]}>
                      / ${camp.goal.toLocaleString()}
                    </Text>
                  </Text>
                  <Text style={[styles.pctText, { color: c.green }]}>{pct.toFixed(0)}%</Text>
                </View>
              </View>
            </Pressable>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search" size={48} color={c.textLight} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No campaigns found</Text>
          </View>
        )}
      </ScrollView>

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
                <Text style={[styles.chipText, { color: !selectedCategory ? Colors.white : c.text }]}>All</Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[styles.chip, { backgroundColor: selectedCategory === cat.id ? c.green : chipBg }]}
                  onPress={() => setSelectedCategory(selectedCategory === cat.id ? "" : cat.id)}
                >
                  <Text style={[styles.chipText, { color: selectedCategory === cat.id ? Colors.white : c.text }]}>{cat.name}</Text>
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
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    gap: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 46,
    height: 46,
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
    color: Colors.white,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImageWrap: {
    width: "100%",
    height: 180,
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  heartBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: 16,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  cardName: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  raisedText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  goalText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
  },
  pctText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 16,
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
    color: Colors.white,
  },
});
