import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";

/**
 * Handles notification tap: deep link using payload from Expo push (see user-push.ts).
 */
export function NotificationNavigationHandler() {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let subscription: { remove: () => void } | undefined;
    try {
      const Notifications = require("expo-notifications") as typeof import("expo-notifications");
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response: import("expo-notifications").NotificationResponse) => {
          const data = response.notification.request.content.data as Record<string, unknown> | undefined;
          if (!data || typeof data.type !== "string") return;
          const key = JSON.stringify(data);
          if (handledRef.current === key) return;
          handledRef.current = key;

          if (data.type === "campaign" && typeof data.campaignId === "string" && data.campaignId) {
            router.push(`/campaign/${encodeURIComponent(data.campaignId)}`);
            return;
          }
          if (data.type === "donation") {
            router.push("/(tabs)/account");
            return;
          }
          if (data.type === "volunteer" && typeof data.orgId === "string" && data.orgId) {
            router.push(`/volunteer/${encodeURIComponent(data.orgId)}`);
          }
        }
      );
    } catch {
      // expo-notifications unavailable
    }

    return () => subscription?.remove();
  }, []);

  return null;
}
