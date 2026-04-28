import React, { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  useWindowDimensions,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useApp, type AppNotification } from "@/context/AppContext";
import AppHeader from "@/components/AppHeader";
import { NotificationMessageText } from "@/lib/notification-message";

const PREVIEW_MAX = 140;

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

function previewMessage(raw: string): string {
  const t = raw.trim();
  if (t.length <= PREVIEW_MAX) return t;
  return `${t.slice(0, PREVIEW_MAX).trim()}…`;
}

function notifIcon(type: AppNotification["type"]): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "success":
      return "checkmark-circle";
    case "new":
      return "sparkles";
    case "warning":
      return "warning";
    default:
      return "notifications";
  }
}

/** Green only on the icon; warning keeps amber for meaning. */
function typeAccent(
  type: AppNotification["type"],
  c: ReturnType<typeof useThemeColors>
): { circleBg: string; iconColor: string } {
  switch (type) {
    case "warning":
      return { circleBg: c.warningAmber + "28", iconColor: c.warningAmber };
    default:
      return { circleBg: c.green + "28", iconColor: c.green };
  }
}

export default function NotificationsScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { height: windowH } = useWindowDimensions();
  const { notifications, refresh, markNotificationRead } = useApp();
  const { isAuthenticated } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<AppNotification | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const openDetail = useCallback(
    (notif: AppNotification) => {
      setDetail(notif);
      void markNotificationRead(notif.id);
    },
    [markNotificationRead]
  );

  const closeDetail = useCallback(() => setDetail(null), []);

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
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {notifications.map((notif) => {
            const unread = !notif.read;
            const accent = typeAccent(notif.type, c);
            const preview = previewMessage(notif.message);
            const showMore = notif.message.trim().length > PREVIEW_MAX;
            return (
              <Pressable
                key={notif.id}
                onPress={() => openDetail(notif)}
                style={({ pressed }) => [
                  styles.notifCard,
                  {
                    backgroundColor: c.cardBg,
                    borderLeftColor: unread ? c.border : "transparent",
                    opacity: pressed ? 0.92 : 1,
                  },
                  unread && styles.notifCardUnread,
                ]}
              >
                {unread ? <View style={[styles.unreadDot, { backgroundColor: c.textMuted }]} /> : null}
                <View style={[styles.iconCircle, { backgroundColor: accent.circleBg }]}>
                  <Ionicons name={notifIcon(notif.type)} size={24} color={accent.iconColor} />
                </View>
                <View style={styles.notifBody}>
                  <Text
                    style={[
                      styles.notifTitle,
                      { color: c.text },
                      unread ? styles.titleUnread : styles.titleRead,
                    ]}
                    numberOfLines={2}
                  >
                    {notif.title}
                  </Text>
                  <Text
                    style={[styles.notifMessage, { color: unread ? c.textMuted : c.textLight }]}
                    numberOfLines={3}
                  >
                    {preview}
                  </Text>
                  {showMore ? (
                    <Text style={[styles.tapHint, { color: c.textMuted }]}>Tap to read full message</Text>
                  ) : null}
                  <Text style={[styles.notifTime, { color: c.textLight }]}>{formatTimeAgo(notif.created_at)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={detail !== null} transparent animationType="fade" onRequestClose={closeDetail}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: c.modalOverlay }]} onPress={closeDetail}>
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: c.cardBg,
                borderColor: c.border,
                maxHeight: windowH * 0.82,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.modalTitle, { color: c.text }]} numberOfLines={2}>
                {detail?.title ?? ""}
              </Text>
              <Pressable
                onPress={closeDetail}
                style={[styles.modalClose, { backgroundColor: c.cardBg }]}
                hitSlop={8}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={c.text} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              showsVerticalScrollIndicator
            >
              {detail ? (
                <>
                  <NotificationMessageText
                    message={detail.message}
                    baseStyle={[styles.modalBody, { color: c.textMuted }]}
                    linkColor={c.linkAccent}
                  />
                  <Text style={[styles.modalTime, { color: c.textLight }]}>{formatTimeAgo(detail.created_at)}</Text>
                </>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 12 },
  notifCard: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderLeftWidth: 3,
    position: "relative",
  },
  notifCardUnread: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  notifBody: { flex: 1, minWidth: 0 },
  notifTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14, marginBottom: 6 },
  titleUnread: { fontFamily: "SpaceGrotesk_600SemiBold" },
  titleRead: { fontFamily: "SpaceGrotesk_400Regular", opacity: 0.88 },
  notifMessage: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, lineHeight: 20, marginBottom: 4 },
  tapHint: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, marginBottom: 4 },
  notifTime: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 20 },
  emptyDesc: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalOverlay: { flex: 1, justifyContent: "center", paddingHorizontal: 20 },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    flex: 1,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    lineHeight: 24,
  },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: { maxHeight: "100%" },
  modalBody: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 15, lineHeight: 24, paddingHorizontal: 16, paddingTop: 16 },
  modalTime: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, paddingHorizontal: 16, marginTop: 16 },
});
