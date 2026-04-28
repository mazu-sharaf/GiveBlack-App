import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerDevicePushToken } from "@/lib/query-client";

const isExpoGo = Constants.executionEnvironment === "storeClient";

let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");

  if (Notifications) {
    Notifications.setNotificationHandler({
      handleNotification: async () =>
        ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }) as any,
    });
  }
} catch (e) {
  console.log("expo-notifications not available:", e);
}

/** Android notification channels (ids must match server push payload channelId when set). */
export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;
  const ch = Notifications.AndroidImportance.DEFAULT;
  await Notifications.setNotificationChannelAsync("default", {
    name: "General",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("donations", {
    name: "Donations",
    importance: ch,
    description: "Donation receipts and new donations to your organization",
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("campaigns", {
    name: "Campaigns",
    importance: ch,
    description: "New campaigns and when your campaign goes live",
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("volunteers", {
    name: "Volunteers",
    importance: ch,
    description: "Volunteer signups for your organization",
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("subscriptions", {
    name: "Subscription & plan",
    importance: ch,
    description: "When your organization plan is upgraded",
    sound: "default",
  });
}

/**
 * Requests permission, registers Expo push token with GiveBlack API (authenticated).
 * Call after login when session.accessToken is available.
 */
export async function registerPushTokenWithAuth(accessToken: string): Promise<string | null> {
  if (Platform.OS === "web" || !Notifications || !Device) return null;

  if (!Device.isDevice) {
    console.log("[push] Skipping push registration: not a physical device");
    return null;
  }

  if (isExpoGo) {
    console.log("[push] Skipping remote push registration: Expo Go does not support remote/background push notifications (SDK 53+). Build a development build via EAS to enable push.");
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[push] Permission not granted");
      return null;
    }

    await ensureAndroidNotificationChannels();

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data;
    if (!token) return null;

    const platform: "ios" | "android" | "web" =
      Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
    await registerDevicePushToken(token, platform, accessToken);

    return token;
  } catch (error) {
    console.log("Error registering for push notifications:", error);
    return null;
  }
}

/** @deprecated Use registerPushTokenWithAuth with accessToken */
export async function registerForPushNotifications(_userId?: string): Promise<string | null> {
  console.warn("registerForPushNotifications without auth is deprecated; use registerPushTokenWithAuth");
  return null;
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  delaySeconds: number = 0
): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: delaySeconds > 0 ? { seconds: delaySeconds } : (null as any),
    });
  } catch (error) {
    console.log("Error scheduling notification:", error);
  }
}

export async function notifyDonationSuccess(amount: number, orgName: string): Promise<void> {
  await scheduleLocalNotification(
    "Donation Confirmed",
    `Your $${amount.toFixed(2)} donation to ${orgName} was successful`
  );
}

export async function notifyTopUpSuccess(amount: number): Promise<void> {
  await scheduleLocalNotification(
    "Wallet Top Up",
    `$${amount.toFixed(2)} has been added to your wallet`
  );
}

export async function notifyWelcome(): Promise<void> {
  await scheduleLocalNotification(
    "Welcome to GiveBlack",
    "Start making a difference in the Black community today",
    5
  );
}
