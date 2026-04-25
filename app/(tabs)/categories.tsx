import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useApp, type Category } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

/** When API has no per-category colors, match admin default (#059669). */
const DEFAULT_CATEGORY_THEME = "#059669";
const CATEGORY_ROW_BG_DARK = "#1C1C1E";

function CategoryRow({ cat, index }: { cat: Category; index: number }) {
  const c = useThemeColors();
  const { isDark } = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const iconLetter = (cat.name ? String(cat.name).trim().charAt(0) : "?").toUpperCase();
  const rowBg = isDark ? CATEGORY_ROW_BG_DARK : c.cardBg;
  const rowBorder = isDark ? "rgba(255,255,255,0.06)" : c.border;
  const count = cat.count ?? 0;
  const iconBg = cat.iconBgColor || DEFAULT_CATEGORY_THEME;
  const iconBorder = cat.iconBorderColor || DEFAULT_CATEGORY_THEME;
  const letterColor = cat.color || DEFAULT_CATEGORY_THEME;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(400)} style={animStyle}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={() => router.push({ pathname: "/category/[id]", params: { id: cat.id } })}
        style={[styles.categoryRow, { backgroundColor: rowBg, borderColor: rowBorder }]}
      >
        <View
          style={[
            styles.catIconWrap,
            { backgroundColor: iconBg, borderColor: iconBorder },
          ]}
        >
          {cat.imageUrl ? (
            <Image
              source={{ uri: cat.imageUrl }}
              style={styles.catImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              placeholder={{ color: iconBg }}
              transition={0}
            />
          ) : (
            <Text style={[styles.fallbackLetter, { color: letterColor }]}>{iconLetter}</Text>
          )}
        </View>
        <View style={styles.catTextWrap}>
          <Text style={[styles.catName, { color: c.text }]}>{cat.name}</Text>
          <Text style={[styles.catCount, { color: c.textMuted }]}>{count} organizations</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.textLight} />
      </Pressable>
    </Animated.View>
  );
}

export default function CategoriesScreen() {
  const { categories, setLastMeaningfulRoute } = useApp();
  const c = useThemeColors();
  const insets = useSafeInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  useFocusEffect(
    useCallback(() => {
      setLastMeaningfulRoute("/categories");
    }, [setLastMeaningfulRoute])
  );

  const bottomPad = insets.bottom;

  const filtered = useMemo(
    () =>
      search.trim()
        ? categories.filter((ct) =>
            ct.name.toLowerCase().includes(search.toLowerCase())
          )
        : categories,
    [search, categories]
  );

  const rawName = user?.name?.trim();
  const derivedFromName = rawName ? rawName.split(" ")[0] : "";
  const derivedFromEmail = !derivedFromName && user?.email ? user.email.split("@")[0] : "";
  const firstName = derivedFromName || derivedFromEmail || "Friend";
  const avatarInitial = firstName[0]?.toUpperCase() || "F";

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.profileRow}>
        <View style={[styles.avatar, { backgroundColor: c.green }]}>
          <Text style={styles.avatarText}>{avatarInitial}</Text>
        </View>
        <View>
          <Text style={[styles.greeting, { color: c.text }]}>Hello, {firstName}</Text>
          <Text style={[styles.subGreeting, { color: c.textMuted }]}>Browse by charity category</Text>
        </View>
      </View>
      <View style={[styles.searchWrap, { backgroundColor: c.inputBg }]}>
        <Ionicons name="search" size={18} color={c.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search Charity Category"
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

      <View style={styles.titleSection}>
        <Text style={[styles.pageTitle, { color: c.text }]}>Select Charity Category</Text>
        <Text style={[styles.pageSubtitle, { color: c.green }]}>You are donating</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 100 }]}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={c.border} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No categories found</Text>
          </View>
        ) : (
          filtered.map((cat, i) => (
            <CategoryRow key={cat.id} cat={cat} index={i} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    color: Colors.white,
  },
  greeting: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  subGreeting: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pageTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
  },
  pageSubtitle: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  categoryRow: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  catIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden" as const,
  },
  catImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  fallbackLetter: {
    fontSize: 22,
    fontWeight: "700",
  },
  catTextWrap: {
    flex: 1,
  },
  catName: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    lineHeight: 23,
  },
  catCount: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginTop: 1,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 16,
  },
});
