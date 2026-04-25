import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

interface VolunteerRow {
  id: string;
  org_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

type Filter = "all" | "pending" | "approved" | "rejected";

export default function OrgVolunteersTab() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { session, fetchWithAuth } = useAuth();
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchWithAuth("/api/org/volunteers", { method: "GET" });
      if (res.ok) {
        const json = await res.json();
        setVolunteers(Array.isArray(json.volunteers) ? json.volunteers : []);
      }
    } catch (e) {
      console.log("Volunteers load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, fetchWithAuth]);

  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  async function setStatus(id: string, status: "approved" | "rejected") {
    if (!session) return;
    setBusyId(id);
    try {
      const res = await fetchWithAuth(`/api/org/volunteers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert("Error", json.error || "Could not update volunteer");
        return;
      }
      setVolunteers((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v)));
    } catch {
      Alert.alert("Error", "Network error");
    } finally {
      setBusyId(null);
    }
  }

  const filtered =
    filter === "all" ? volunteers : volunteers.filter((v) => v.status === filter);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={c.green} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.text }]}>Volunteers</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <Pressable
            key={f}
            style={[
              styles.chip,
              {
                backgroundColor: filter === f ? c.green : c.cardBg,
                borderColor: filter === f ? c.green : c.border,
              },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, { color: filter === f ? "#fff" : c.textMuted }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.green} />}
      >
        {filtered.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: c.cardBg }]}>
            <Ionicons name="people-outline" size={40} color={c.textMuted} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No volunteers in this view</Text>
          </View>
        ) : (
          filtered.map((v) => (
            <View key={v.id} style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.name, { color: c.text }]}>{v.name || "—"}</Text>
              <Text style={[styles.meta, { color: c.textMuted }]}>{v.email || ""}</Text>
              {v.phone ? <Text style={[styles.meta, { color: c.textMuted }]}>{v.phone}</Text> : null}
              {v.skills ? (
                <Text style={[styles.skills, { color: c.text }]} numberOfLines={3}>
                  Skills: {v.skills}
                </Text>
              ) : null}
              {v.message ? (
                <Text style={[styles.msg, { color: c.textMuted }]} numberOfLines={4}>
                  {v.message}
                </Text>
              ) : null}
              <View style={styles.row}>
                <View style={[styles.badge, { backgroundColor: c.green + "22" }]}>
                  <Text style={[styles.badgeText, { color: c.green }]}>{v.status}</Text>
                </View>
                {v.status === "pending" && (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.btn, { backgroundColor: c.green }]}
                      disabled={busyId === v.id}
                      onPress={() =>
                        Alert.alert("Approve volunteer", `Approve ${v.name || v.email}?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Approve", onPress: () => void setStatus(v.id, "approved") },
                        ])
                      }
                    >
                      <Text style={styles.btnText}>Approve</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.btnOutline, { borderColor: c.border }]}
                      disabled={busyId === v.id}
                      onPress={() =>
                        Alert.alert("Decline", `Decline ${v.name || v.email}?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Decline", style: "destructive", onPress: () => void setStatus(v.id, "rejected") },
                        ])
                      }
                    >
                      <Text style={[styles.btnOutlineText, { color: c.textMuted }]}>Decline</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 26, flex: 1 },
  filterRow: { marginBottom: 12, maxHeight: 44 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  list: { paddingHorizontal: 20, gap: 12 },
  empty: { borderRadius: 16, padding: 40, alignItems: "center" },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 15, marginTop: 12 },
  card: { borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  name: { fontFamily: "Poppins_600SemiBold", fontSize: 16, marginBottom: 4 },
  meta: { fontFamily: "Poppins_400Regular", fontSize: 13, marginBottom: 2 },
  skills: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 8 },
  msg: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 6, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  btnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  btnOutline: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  btnOutlineText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});
