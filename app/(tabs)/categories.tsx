import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons, MaterialCommunityIcons, FontAwesome6 } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

// Font/glyph existence checks so we can reliably fall back to a letter.
// If we try to render an icon name that doesn't exist in the glyph map,
// vector-icons may display a '?' placeholder.
const FA6_GLYPH_MAP: Record<string, unknown> = (() => {
  try {
    // FontAwesome6Free glyph names used by @expo/vector-icons FontAwesome6.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome6Free.json");
  } catch {
    return {};
  }
})();

const MCI_GLYPH_MAP: Record<string, unknown> = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json");
  } catch {
    return {};
  }
})();

function CategoryRow({ cat, index }: { cat: any; index: number }) {
  const c = useThemeColors();
  const { isDark } = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // `categories.icon` values stored from the admin panel look like:
  //   color-palette-outline, megaphone-outline, people-outline, ...
  // Those are NOT valid Ionicons names, so the icon renderer falls back to `?`.
  // Map known values to valid MaterialCommunityIcons names.
  const MCI_ICON_MAP: Record<string, string> = {
    "color-palette-outline": "palette-outline",
    "megaphone-outline": "bullhorn-outline",
    "people-outline": "account-group-outline",
    "trending-up-outline": "trending-up",
    "school-outline": "school-outline",
    "leaf-outline": "leaf",
    "star-outline": "star-outline",
    "heart-outline": "heart-outline",
    "home-outline": "home-outline",
    "happy-outline": "emoticon-happy-outline",
  };

  const iconVal = (cat.icon || "").trim();
  const mappedMci = MCI_ICON_MAP[iconVal];

  // Support Font Awesome 6 icons stored directly from admin (example: `users-rays`).
  // We only treat it as FontAwesome when it doesn't look like an MCI/Ionicons name (most MCI values end with `-outline`).
  const faName =
    iconVal.startsWith("fa-")
      ? iconVal.replace(/^fa-/, "")
      : !iconVal.includes("outline") && iconVal.includes("-")
        ? iconVal
        : "";

  const iconLetter = (cat.name ? String(cat.name).trim().charAt(0) : "?").toUpperCase();
  const hasFa6 = Boolean(faName && FA6_GLYPH_MAP[faName]);
  const hasMci = Boolean(mappedMci && MCI_GLYPH_MAP[mappedMci]);

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(400)} style={animStyle}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={() => router.push({ pathname: "/category/[id]", params: { id: cat.id } })}
        style={[styles.categoryRow, { backgroundColor: c.cardBg }]}
      >
        <View style={[styles.catIconWrap, { backgroundColor: cat.imageUrl ? 'transparent' : (isDark ? `${cat.color}33` : cat.color) }]}>
          {cat.imageUrl ? (
            <Image source={{ uri: cat.imageUrl }} style={styles.catImage} cachePolicy="memory-disk" transition={200} />
          ) : (
            hasFa6 ? (
              <FontAwesome6 name={faName as any} size={26} color={isDark ? cat.color : Colors.primary} />
            ) : hasMci ? (
              <MaterialCommunityIcons
                name={mappedMci as any}
                size={26}
                color={isDark ? cat.color : Colors.primary}
              />
            ) : (
              // If icon is missing/unknown, show first letter (never '?').
              <Text style={{ fontSize: 22, fontWeight: "700", color: isDark ? cat.color : Colors.primary }}>
                {iconLetter}
              </Text>
            )
          )}
        </View>
        <View style={styles.catTextWrap}>
          <Text style={[styles.catName, { color: c.text }]}>{cat.name}</Text>
          <Text style={[styles.catCount, { color: c.textMuted }]}>{cat.count} organizations</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.textLight} />
      </Pressable>
    </Animated.View>
  );
}

export default function CategoriesScreen() {
  const { categories } = useApp();
  const c = useThemeColors();
  const insets = useSafeInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

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
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.white,
  },
  greeting: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  subGreeting: {
    fontFamily: "Poppins_400Regular",
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
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pageTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
  },
  pageSubtitle: {
    fontFamily: "Poppins_500Medium",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  catIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden" as const,
  },
  catImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  catTextWrap: {
    flex: 1,
  },
  catName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    lineHeight: 22,
  },
  catCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
  },
});
