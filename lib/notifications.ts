import { Platform } from "react-native";
import Constants from "expo-constants";

const isExpoGo = Constants.executionEnvironment === "storeClient";
const isAndroidExpoGo = Platform.OS === "android" && isExpoGo;

let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

if (!isAndroidExpoGo) {
  try {
    Notifications = require("expo-notifications");
    Device = require("expo-device");

    if (Notifications) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        } as any),
      });
    }
  } catch (e) {
    console.log("expo-notifications not available:", e);
  }
}

export async function registerForPushNotifications(userId?: string): Promise<string | null> {
  if (Platform.OS === "web" || !Notifications || !Device) return null;

  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
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
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    if (userId && token) {
      await savePushToken(userId, token);
    }

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    return token;
  } catch (error) {
    console.log("Error registering for push notifications:", error);
    return null;
  }
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || "";
    await fetch(`${apiUrl}/api/push-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        expo_push_token: token,
        platform: Platform.OS,
      }),
    });
  } catch (error) {
    console.log("Error saving push token:", error);
  }
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
      trigger: delaySeconds > 0 ? { seconds: delaySeconds } : null as any,
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
