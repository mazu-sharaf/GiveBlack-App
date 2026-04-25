import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useThemeColors } from "@/context/ThemeContext";
import { useApp, Organization } from "@/context/AppContext";
import OrgAvatar from "@/components/OrgAvatar";
import AppHeader from "@/components/AppHeader";

function OrgRow({
  org,
  index,
  onPress,
}: {
  org: Organization;
  index: number;
  onPress: (id: string) => void;
}) {
  const c = useThemeColors();

  return (
    <Animated.View entering={FadeInDown.delay(index * 30).duration(350)}>
      <Pressable
        style={[styles.orgRow, { backgroundColor: c.cardBg }]}
        onPress={() => {
          Haptics.selectionAsync();
          onPress(org.id);
        }}
      >
        <OrgAvatar imageUrl={org.imageUrl} thumbnailUrl={org.thumbnailUrl} initials={org.initials} imageColor={org.imageColor} size={48} fontSize={14} />
        <Text style={[styles.orgName, { color: c.text }]} numberOfLines={2}>{org.name}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeInsets();
  const c = useThemeColors();
  const [search, setSearch] = useState("");

  const { categories, organizations, setLastMeaningfulRoute } = useApp();

  useFocusEffect(
    useCallback(() => {
      if (id) setLastMeaningfulRoute(`/category/${id}`);
    }, [id, setLastMeaningfulRoute])
  );
  const category = categories.find((ct) => ct.id === id);
  const orgs = organizations
    .filter((o) => o.categoryId === id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const filtered = search.trim()
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  const bottomPad = insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="Category" />
      <View style={[styles.searchWrap, { backgroundColor: c.inputBg }]}>
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search Organization"
          placeholderTextColor={c.textLight}
          value={search}
          onChangeText={setSearch}
        />
        <Ionicons name="search" size={18} color={c.textMuted} />
      </View>

      <View style={styles.titleSection}>
        <Text style={[styles.pageTitle, { color: c.text }]}>Browse Organizations</Text>
        <Text style={[styles.pageSubtitle, { color: c.textMuted }]} numberOfLines={1}>
          Tap an organization to view details
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 20 }]}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={c.border} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No organizations found</Text>
          </View>
        ) : (
          filtered.map((org, i) => (
            <OrgRow
              key={org.id}
              org={org}
              index={i}
              onPress={(orgId) => router.push({ pathname: "/organization/[id]", params: { id: orgId } })}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  pageTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 19,
  },
  pageSubtitle: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  orgRow: {
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  orgAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  orgInitials: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  orgName: {
    flex: 1,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    lineHeight: 20,
  },
  infoBtn: {
    padding: 2,
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  expandedCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  expandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  expandedName: {
    flex: 1,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    lineHeight: 22,
  },
  expandedDesc: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    lineHeight: 21,
    marginBottom: 8,
  },
  expandedStats: {
    flexDirection: "row",
    gap: 16,
  },
  expandedStat: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
  },
  bottomButtons: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 10,
  },
  nextBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  nextBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
  },
  historyBtn: {
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  historyBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 15,
  },
});
