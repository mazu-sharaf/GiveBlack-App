import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "@gb_access_token";
const REFRESH_TOKEN_KEY = "@gb_refresh_token";

export function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL || "";
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (envUrl && !envUrl.includes("localhost")) return envUrl.replace(/\/?$/, "/");
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${host}:5000/`;
  }
  if (envUrl) return envUrl.replace(/\/?$/, "/");
  return "https://giveblackapp.com/";
}

async function tryRefreshToken(): Promise<string | null> {
  try {
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    const baseUrl = getApiUrl().replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.accessToken) {
      await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
      if (data.refreshToken) {
        await AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      }
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function apiPost<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const baseUrl = getApiUrl().replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401 && accessToken) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    }
  }

  if (!res.ok) {
    let message = "API request failed";
    try {
      const data = await res.json();
      // Prefer server-provided detail over generic HTTP label like "Bad Request".
      message = data.message || data.error || message;
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string, accessToken?: string): Promise<T> {
  const baseUrl = getApiUrl().replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${baseUrl}${path}`, { method: "GET", headers });

  if (res.status === 401 && accessToken) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${baseUrl}${path}`, { method: "GET", headers });
    }
  }

  if (!res.ok) {
    let message = "API request failed";
    try {
      const data = await res.json();
      message = data.message || data.error || message;
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export async function registerDevicePushToken(
  token: string,
  platform: "ios" | "android" | "web",
  accessToken: string
): Promise<void> {
  await apiPost("/api/notifications/push-token", { token, platform }, accessToken);
}
