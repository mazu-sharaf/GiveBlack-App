import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

function isOrgAudience(data: Record<string, unknown>, userType: "donor" | "charity" | undefined): boolean {
  if (data.audience === "org") return true;
  if (data.audience === "donor") return false;
  return userType === "charity";
}

/**
 * Handles notification tap: deep link using payload from Expo push (see user-push.ts).
 */
function NotificationNavigationHandlerInner() {
  const { user } = useAuth();
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

          const orgShell = isOrgAudience(data, user?.type);

          if (data.type === "campaign" && typeof data.campaignId === "string" && data.campaignId) {
            if (orgShell) {
              router.push("/(org)/(main)/campaigns");
            } else {
              router.push(`/campaign/${encodeURIComponent(data.campaignId)}`);
            }
            return;
          }
          if (data.type === "donation") {
            if (orgShell) {
              router.push("/(org)/(main)/donations");
            } else {
              router.push("/(tabs)/account");
            }
            return;
          }
          if (data.type === "volunteer" && typeof data.orgId === "string" && data.orgId) {
            if (orgShell) {
              router.push("/(org)/volunteers");
            } else {
              router.push(`/volunteer/${encodeURIComponent(data.orgId)}`);
            }
            return;
          }
          if (data.type === "charity_approved" && orgShell) {
            router.push("/(org)/(main)");
            return;
          }
          if (data.type === "subscription" && orgShell) {
            router.push("/(org)/(main)/subscriptions");
            return;
          }
        }
      );
    } catch {
      // expo-notifications unavailable
    }

    return () => subscription?.remove();
  }, [user?.type]);

  return null;
}

export function NotificationNavigationHandler() {
  return <NotificationNavigationHandlerInner />;
}
