import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import AppHeader from "@/components/AppHeader";

export default function CommunityCreateScreen() {
  const c = useThemeColors();
  const insets = useSafeInsets();
  const { user, session } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [atCampaignLimit, setAtCampaignLimit] = useState(false);
  const [limitMax, setLimitMax] = useState<number | null>(null);
  const baseUrl = getApiUrl().replace(/\/$/, "");

  useEffect(() => {
    if (!session?.access_token || !user?.email) return;
    fetch(`${baseUrl}/api/community-campaigns/categories`)
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, [baseUrl, session?.access_token, user?.email]);

  useEffect(() => {
    if (!session?.access_token || !user?.email) return;
    const headers = { Authorization: `Bearer ${session.access_token}` };
    fetch(`${baseUrl}/api/charity/my-subscription?email=${encodeURIComponent(user.email)}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        const lim = data.subscription?.limits;
        const count = data.community_campaign_count;
        if (typeof count === "number" && lim && typeof lim.max_community_campaigns === "number") {
          setAtCampaignLimit(count >= lim.max_community_campaigns);
          setLimitMax(lim.max_community_campaigns);
        }
      })
      .catch(() => {});
  }, [baseUrl, session?.access_token, user?.email]);

  const handleSubmit = async () => {
    const t = title.trim();
    const d = description.trim();
    const g = parseFloat(goal);
    if (!t) {
      Alert.alert("Required", "Enter a title.");
      return;
    }
    if (!d) {
      Alert.alert("Required", "Enter a description.");
      return;
    }
    if (!g || g <= 0) {
      Alert.alert("Required", "Enter a valid goal amount.");
      return;
    }
    if (!categoryId) {
      Alert.alert("Required", "Select a category.");
      return;
    }
    if (!session?.access_token) {
      Alert.alert("Sign in required", "You must be signed in to create a campaign.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${baseUrl}/api/community-campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: t,
          description: d,
          goal: g,
          category_id: categoryId,
          status: "active",
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        Alert.alert("Created", "Your community campaign is live.", [
          { text: "OK", onPress: () => router.replace({ pathname: "/community/[id]", params: { id: data.id } }) },
        ]);
      } else if (res.status === 403 && (data as any).limit === "max_community_campaigns") {
        const max = (data as any).max ?? 1;
        Alert.alert(
          "Plan limit reached",
          `You've reached your plan limit (${max} campaign${max === 1 ? "" : "s"}). Upgrade in Your plan to create more.`,
          [
            { text: "OK" },
            { text: "View plans", onPress: () => router.push("/(charity)/plan") },
          ]
        );
      } else if (res.status === 400 && (data as any).max_goal != null) {
        const maxGoal = (data as any).max_goal;
        Alert.alert(
          "Goal exceeds plan limit",
          `Goal exceeds your plan limit ($${Number(maxGoal).toLocaleString()}). Upgrade to set a higher goal.`,
          [
            { text: "OK" },
            { text: "View plans", onPress: () => router.push("/(charity)/plan") },
          ]
        );
      } else {
        Alert.alert("Error", (data as any).error || "Failed to create campaign.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create campaign.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Create Campaign" showSearch={false} />
        <Text style={[styles.msg, { color: c.text }]}>Sign in to create a community campaign.</Text>
        <Pressable onPress={() => router.back()}><Text style={{ color: c.green }}>Go back</Text></Pressable>
      </View>
    );
  }

  if (user.type !== "charity") {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Create Campaign" showSearch={false} />
        <Text style={[styles.msg, { color: c.text }]}>Only charity/business accounts can create community campaigns. Donors can browse and donate.</Text>
        <Pressable onPress={() => router.back()}><Text style={{ color: c.green }}>Go back</Text></Pressable>
      </View>
    );
  }

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: c.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader showBack title="Create Campaign" showSearch={false} />
      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          {atCampaignLimit && (
            <Pressable
              style={[styles.limitBanner, { backgroundColor: c.green + "20", borderColor: c.green }]}
              onPress={() => router.push("/(charity)/plan")}
            >
              <Text style={[styles.limitBannerText, { color: c.text }]}>You've reached your plan limit ({limitMax} campaign{limitMax === 1 ? "" : "s"}). Tap to upgrade and create more.</Text>
            </Pressable>
          )}
          <Text style={[styles.heading, { color: c.text }]}>New Community Campaign</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
            placeholder="Campaign title"
            placeholderTextColor={c.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
            placeholder="Description"
            placeholderTextColor={c.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <TextInput
            style={[styles.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
            placeholder="Goal amount ($)"
            placeholderTextColor={c.textMuted}
            value={goal}
            onChangeText={setGoal}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.label, { color: c.textMuted }]}>Category</Text>
          <View style={styles.catWrap}>
            {categories.map((cat: any) => (
              <Pressable
                key={cat.id}
                style={[styles.catChip, categoryId === cat.id ? { backgroundColor: c.green } : { backgroundColor: c.surface }]}
                onPress={() => setCategoryId(cat.id)}
              >
                <Text style={[styles.catChipText, { color: categoryId === cat.id ? "#fff" : c.text }]}>{cat.name}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.submitBtn, { backgroundColor: c.green }]} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Create campaign</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  msg: { fontSize: 16 },
  body: { padding: 20 },
  heading: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  textArea: { minHeight: 100 },
  label: { fontSize: 14, marginBottom: 8 },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  catChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  catChipText: { fontSize: 14, fontWeight: "500" },
  submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  submitBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  limitBanner: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  limitBannerText: { fontSize: 14 },
});
