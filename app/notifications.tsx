import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useApp, type AppNotification } from "@/context/AppContext";
import AppHeader from "@/components/AppHeader";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function notifIcon(type: AppNotification["type"]): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "success": return "checkmark-circle";
    case "new": return "sparkles";
    case "warning": return "warning";
    default: return "information-circle";
  }
}

export default function NotificationsScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { notifications, refresh } = useApp();
  const { isAuthenticated } = useAuth();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="Notifications" showNotifications={false} />

      {notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="notifications-off-outline" size={56} color={c.textMuted} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>No notifications yet</Text>
          <Text style={[styles.emptyDesc, { color: c.textMuted }]}>
            {isAuthenticated
              ? "You'll see donation confirmations, campaign updates, and more here"
              : "Sign in to receive personalized notifications"}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {notifications.map((notif) => (
            <View key={notif.id} style={[styles.notifCard, { backgroundColor: c.cardBg }]}>
              <View style={[styles.iconCircle, { backgroundColor: notif.type === "success" ? c.green + "20" : c.blue + "20" }]}>
                <Ionicons
                  name={notifIcon(notif.type)}
                  size={24}
                  color={notif.type === "success" ? c.green : c.blue}
                />
              </View>
              <View style={styles.notifBody}>
                <Text style={[styles.notifTitle, { color: c.text }]}>{notif.title}</Text>
                <Text style={[styles.notifMessage, { color: c.textMuted }]}>{notif.message}</Text>
                <Text style={[styles.notifTime, { color: c.textLight }]}>{formatTimeAgo(notif.created_at)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 18 },
  list: { padding: 16, gap: 12 },
  notifCard: { flexDirection: "row", borderRadius: 12, padding: 16, gap: 12 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  notifBody: { flex: 1 },
  notifTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, marginBottom: 4 },
  notifMessage: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 18, marginBottom: 4 },
  notifTime: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 20 },
  emptyDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
