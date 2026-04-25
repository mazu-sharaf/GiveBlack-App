import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useApp } from "@/context/AppContext";
import { useThemeColors } from "@/context/ThemeContext";
import { getCampaignImage } from "@/constants/images";
import { getApiUrl } from "@/lib/query-client";
import OrgAvatar from "@/components/OrgAvatar";
import AppHeader from "@/components/AppHeader";

interface SearchResult {
  id: string;
  title: string;
  orgName?: string;
  raised: number;
  goal: number;
  mainImageUrl?: string;
}

export default function SearchScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { campaigns } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setSearched(true);
      const q = query.toLowerCase();
      const filtered = campaigns.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(q) ||
          (c.orgName || "").toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q)
      );
      setResults(
        filtered.map((c) => ({
          id: c.id,
          title: c.title,
          orgName: c.orgName,
          raised: c.raised,
          goal: c.goal,
          mainImageUrl: c.mainImageUrl,
        }))
      );
      setLoading(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, campaigns]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="Search" showSearch={false} />
      <View style={styles.header}>
        <View style={[styles.searchBox, { backgroundColor: c.inputBg }]}>
          <Ionicons name="search-outline" size={20} color={c.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search campaigns..."
            placeholderTextColor={c.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {loading && <ActivityIndicator size="small" color={c.textMuted} />}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.results, { flexGrow: 1 }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {results.map((item, i) => {
          const pct = item.goal > 0 ? Math.min((item.raised / item.goal) * 100, 100) : 0;
          return (
            <Pressable
              key={item.id}
              style={[styles.resultCard, { backgroundColor: c.cardBg }]}
              onPress={() => router.push({ pathname: "/campaign/[id]", params: { id: item.id } })}
            >
              <Image source={item.mainImageUrl ? { uri: item.mainImageUrl } : getCampaignImage(i)} style={styles.resultImage} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} transition={200} placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }} />
              <View style={styles.resultBody}>
                <Text style={[styles.resultName, { color: c.text }]} numberOfLines={2}>{item.title}</Text>
                {item.orgName && <Text style={[styles.resultMeta, { color: c.textMuted }]} numberOfLines={1}>{item.orgName}</Text>}
                <View style={[styles.progressBar, { backgroundColor: c.border }]}>
                  <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: c.green }]} />
                </View>
                <Text style={[styles.resultMeta, { color: c.textMuted }]}>
                  ${item.raised.toLocaleString()} raised
                </Text>
              </View>
            </Pressable>
          );
        })}
        {searched && results.length === 0 && !loading && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={c.textMuted} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No campaigns found</Text>
          </View>
        )}
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontFamily: "SpaceGrotesk_400Regular", fontSize: 15 },
  results: { padding: 16, gap: 12 },
  resultCard: { flexDirection: "row", borderRadius: 12, overflow: "hidden", padding: 12, gap: 12 },
  resultImage: { width: 80, height: 80, borderRadius: 8 },
  resultBody: { flex: 1, justifyContent: "center" },
  resultName: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14, marginBottom: 8 },
  progressBar: { height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: 4 },
  resultMeta: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 16 },
});
