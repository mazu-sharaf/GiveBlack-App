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
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import AppHeader from "@/components/AppHeader";

export default function CommunityCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useThemeColors();
  const insets = useSafeInsets();
  const { user, session } = useAuth();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [donateAmount, setDonateAmount] = useState("");
  const [donateMessage, setDonateMessage] = useState("");
  const [donating, setDonating] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [reporting, setReporting] = useState(false);
  const baseUrl = getApiUrl();

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`${baseUrl}api/community-campaigns/${id}`);
        const data = await res.json();
        setCampaign(data);
      } catch {
        setCampaign(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, baseUrl]);

  const handleDonate = async () => {
    const amt = parseFloat(donateAmount);
    if (!amt || amt <= 0) {
      Alert.alert("Invalid amount", "Enter a valid amount.");
      return;
    }
    setDonating(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch(`${baseUrl}api/community-campaigns/${id}/donate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ amount: amt, message: donateMessage || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert("Thank you", `Your donation of $${amt.toFixed(2)} was recorded.`);
        setDonateAmount("");
        setDonateMessage("");
        if (campaign) setCampaign({ ...campaign, raised: Number(campaign.raised) + amt, donor_count: (campaign.donor_count || 0) + 1 });
      } else {
        Alert.alert("Error", (data as any).error || "Donation failed.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Donation failed.");
    } finally {
      setDonating(false);
    }
  };

  const handleReport = async () => {
    if (!reportReason.trim()) {
      Alert.alert("Required", "Please enter a reason for the report.");
      return;
    }
    if (!session?.access_token) {
      Alert.alert("Sign in required", "You must be signed in to report.");
      return;
    }
    setReporting(true);
    try {
      const res = await fetch(`${baseUrl}api/community-campaigns/${id}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert("Report submitted", "Thank you. Our team will review it.");
        setShowReport(false);
        setReportReason("");
      } else {
        Alert.alert("Error", (data as any).error || "Report failed.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Report failed.");
    } finally {
      setReporting(false);
    }
  };

  if (loading || !campaign) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Campaign" showSearch={false} />
        {loading && <ActivityIndicator size="large" color={c.green} />}
        {!loading && !campaign && (
          <>
            <Text style={[styles.notFound, { color: c.textMuted }]}>Campaign not found</Text>
            <Pressable onPress={() => router.back()}><Text style={{ color: c.green }}>Go back</Text></Pressable>
          </>
        )}
      </View>
    );
  }

  const pct = campaign.goal > 0 ? Math.min((Number(campaign.raised) / Number(campaign.goal)) * 100, 100) : 0;
  const updates = campaign.updates || [];
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: c.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader showBack title={campaign.title || "Campaign"} showSearch={false} />
      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 100 }} showsVerticalScrollIndicator={false}>
        {campaign.cover_image_url ? (
          <Image source={{ uri: campaign.cover_image_url }} style={styles.hero} contentFit="cover" cachePolicy="memory-disk" transition={200} placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }} />
        ) : (
          <View style={[styles.heroPlaceholder, { backgroundColor: c.surface }]}>
            <Ionicons name="images-outline" size={48} color={c.textMuted} />
          </View>
        )}
        <View style={styles.body}>
          <Text style={[styles.title, { color: c.text }]}>{campaign.title}</Text>
          <Text style={[styles.category, { color: c.textMuted }]}>{campaign.community_campaign_categories?.name || campaign.category_id || ""}</Text>
          <Text style={[styles.desc, { color: c.text }]}>{campaign.description}</Text>
          <View style={[styles.progressBg, { backgroundColor: c.surface }]}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: c.green }]} />
          </View>
          <Text style={[styles.raised, { color: c.textMuted }]}>
            ${Number(campaign.raised).toLocaleString()} of ${Number(campaign.goal).toLocaleString()} · {campaign.donor_count ?? 0} donors
          </Text>

          {updates.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Updates</Text>
              {updates.map((u: any) => (
                <View key={u.id} style={[styles.updateCard, { backgroundColor: c.cardBg }]}>
                  <Text style={[styles.updateText, { color: c.text }]}>{u.content}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Donate</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
              placeholder="Amount (e.g. 25)"
              placeholderTextColor={c.textMuted}
              value={donateAmount}
              onChangeText={setDonateAmount}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
              placeholder="Message (optional)"
              placeholderTextColor={c.textMuted}
              value={donateMessage}
              onChangeText={setDonateMessage}
              multiline
            />
            <Pressable style={[styles.donateBtn, { backgroundColor: c.green }]} onPress={handleDonate} disabled={donating}>
              <Text style={styles.donateBtnText}>{donating ? "Processing…" : "Donate"}</Text>
            </Pressable>
          </View>

          {session?.access_token && (
            <View style={styles.section}>
              {!showReport ? (
                <Pressable onPress={() => setShowReport(true)}>
                  <Text style={[styles.reportLink, { color: c.textMuted }]}>Report this campaign</Text>
                </Pressable>
              ) : (
                <>
                  <TextInput
                    style={[styles.input, styles.textArea, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                    placeholder="Reason for report"
                    placeholderTextColor={c.textMuted}
                    value={reportReason}
                    onChangeText={setReportReason}
                    multiline
                  />
                  <View style={styles.reportActions}>
                    <Pressable onPress={() => { setShowReport(false); setReportReason(""); }}>
                      <Text style={[styles.reportCancel, { color: c.textMuted }]}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={handleReport} disabled={reporting}>
                      <Text style={[styles.reportSubmit, { color: c.green }]}>{reporting ? "Sending…" : "Submit report"}</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  notFound: { fontSize: 16 },
  hero: { width: "100%", height: 220 },
  heroPlaceholder: { width: "100%", height: 180, alignItems: "center", justifyContent: "center" },
  body: { padding: 20 },
  title: { fontSize: 22, fontWeight: "700" },
  category: { fontSize: 14, marginTop: 4 },
  desc: { fontSize: 15, marginTop: 12, lineHeight: 22 },
  progressBg: { height: 8, borderRadius: 4, marginTop: 16, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  raised: { fontSize: 14, marginTop: 8 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  updateCard: { padding: 12, borderRadius: 10, marginBottom: 8 },
  updateText: { fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 10 },
  textArea: { minHeight: 80 },
  donateBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 4 },
  donateBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  reportLink: { fontSize: 14 },
  reportActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  reportCancel: { fontSize: 14 },
  reportSubmit: { fontSize: 14, fontWeight: "600" },
});
