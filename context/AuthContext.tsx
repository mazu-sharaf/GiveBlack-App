import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { getApiUrl } from "@/lib/query-client";
import { isGoogleSignInUserCancelled } from "@/lib/google-signin-errors";
import { getPreferredDisplayName } from "@/lib/user-display";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  phone?: string;
  type: "donor" | "charity";
  zipCode?: string;
  collegeAttended?: boolean;
  charityName?: string;
  charityCategory?: string;
  charityDescription?: string;
  charityUrl?: string;
}

interface SessionData {
  accessToken: string;
  refreshToken: string | null;
}

interface DonationSummary {
  total_amount_cents: number;
  donation_count: number;
  first_donation_at: string | null;
  last_donation_at: string | null;
  rank: number | null;
}

export type OAuthLoginErrorType =
  | "cancelled"
  | "conflict"
  | "not_configured"
  | "network"
  | "invalid_credentials"
  | "other";

interface AuthContextValue {
  user: UserProfile | null;
  session: SessionData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  avatarUrl?: string | null;
  /** Update avatar URL locally (also persists in AsyncStorage). */
  setAvatarUrl: (url: string | null) => Promise<void>;
  donationSummary?: DonationSummary | null;
  /** Refetch /api/me/donations/summary (call after donations and on home refresh). Returns parsed summary when available. */
  refreshDonationSummary: () => Promise<DonationSummary | null>;
  /** Number of pending (incomplete) donations for the signed-in donor. */
  pendingDonationCount: number;
  /** Refetch /api/me/donations/pending-count. */
  refreshPendingDonationCount: () => Promise<void>;
  /** True when the signed-in user has no real display name (OAuth relay email used as fallback). */
  needsDisplayName: boolean;
  /** Save a real display name to the backend and dismiss the prompt. */
  saveDisplayName: (name: string) => Promise<void>;
  /** Dismiss the display-name prompt without saving (Skip). */
  dismissDisplayNamePrompt: () => void;
  login: (email: string, password: string, type: "donor" | "charity") => Promise<{ success: boolean; error?: string; errorType?: "invalid_credentials" | "email_not_confirmed" | "network" | "other" }>;
  /** Donor welcome screen: native Google, API, same session as password login. */
  loginWithGoogle: () => Promise<{ success: boolean; error?: string; errorType?: OAuthLoginErrorType }>;
  /** iOS only (no-op / error on Android). */
  loginWithApple: () => Promise<{ success: boolean; error?: string; errorType?: OAuthLoginErrorType }>;
  guestLogin: () => Promise<void>;
  signUpDonor: (data: { name: string; email: string; password: string; zipCode: string; collegeAttended: boolean }) => Promise<boolean>;
  signUpCharity: (data: {
    charityName: string;
    category: string;
    categoryId?: string;
    description: string;
    url: string;
    name: string;
    email: string;
    password: string;
    bank_name?: string;
    account_holder_name?: string;
    routing_number?: string;
    account_last4?: string;
    account_number?: string;
    tax_id?: string;
  }) => Promise<boolean>;
  requestResetCode: (email: string) => Promise<{ success: boolean; error?: string; rateLimited?: boolean }>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: Partial<UserProfile>) => void;
  logout: () => Promise<void>;
  /** Authenticated fetch: attaches Bearer token, refreshes on 401 and retries once; throws if session cannot be renewed. */
  fetchWithAuth: (pathOrUrl: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "@gb_access_token";
const REFRESH_TOKEN_KEY = "@gb_refresh_token";
const USER_KEY = "@gb_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  /** Prevents parallel refresh calls (e.g. Promise.all) from racing and invalidating the refresh token. */
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [donationSummary, setDonationSummary] = useState<DonationSummary | null>(null);
  const [pendingDonationCount, setPendingDonationCount] = useState(0);
  const [needsDisplayName, setNeedsDisplayName] = useState(false);

  useLayoutEffect(() => {
    void (async () => {
      try {
        const { configureGoogleSignIn } = await import("@/lib/oauth-google");
        await configureGoogleSignIn();
      } catch (e) {
        console.warn("Google Sign-In startup init failed:", e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // Load saved session on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const [token, refreshToken, userData] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(REFRESH_TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY)
        ]);

        if (token && userData) {
          setSession({ accessToken: token, refreshToken });
          const parsed = JSON.parse(userData) as UserProfile;
          setUser(parsed);
          setAvatarUrl((parsed as any).avatar_url || null);
        }
      } catch (e) {
        console.log("Failed to load session:", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, []);

  // Intentionally disabled: auto-logout after inactivity.
  // UX requirement: user stays logged in until they press `Logout`.
  useEffect(() => {
    void session;
  }, [session]);

  const setAvatarUrlAndPersist = useCallback(
    async (url: string | null) => {
      setAvatarUrl(url);
      try {
        const raw = await AsyncStorage.getItem(USER_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed.avatar_url = url;
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(parsed));
      } catch {
        // non-fatal
      }
    },
    [setAvatarUrl]
  );

  useEffect(() => {
    if (!session?.accessToken || !user?.id || isGuest) return;
    let cancelled = false;
    void (async () => {
      try {
        const { registerPushTokenWithAuth } = await import("@/lib/notifications");
        if (!cancelled) await registerPushTokenWithAuth(session.accessToken);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, user?.id, isGuest]);

  function isNetworkError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return lower.includes("network request failed") || lower.includes("fetch failed") || lower.includes("networkerror") || lower.includes("timeout") || lower.includes("aborted");
  }

  async function refreshAccessToken(): Promise<string | null> {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }
    const p = (async (): Promise<string | null> => {
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
          setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken || refreshToken });
          return data.accessToken;
        }
        return null;
      } catch (e: unknown) {
        console.log("Token refresh failed:", e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = p;
    return p;
  }

  async function apiCall(endpoint: string, method: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const baseUrl = getApiUrl().replace(/\/$/, "");
    const token = session?.accessToken;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && token) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
        response = await fetch(`${baseUrl}${endpoint}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      } else {
        await logout();
        throw new Error("Session expired. Please log in again.");
      }
    }

    if (response.status === 204 || response.headers.get("content-length") === "0") {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return {};
    }

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
  }

  async function login(email: string, password: string, type: "donor" | "charity"): Promise<{ success: boolean; error?: string; errorType?: "invalid_credentials" | "email_not_confirmed" | "network" | "other" }> {
    if (!email.trim() || !password.trim()) {
      return { success: false, error: "Please enter email and password." };
    }

    // Clear any existing guest session
    setIsGuest(false);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await apiCall("/api/auth/login", "POST", {
          email: email.trim().toLowerCase(),
          password,
        });

        if (data.accessToken && data.user) {
          const serverType: "donor" | "charity" =
            (data.user.type === "charity" || data.user.role === "charity_owner") ? "charity" : "donor";

          // Prevent charity accounts from logging into the donor app
          if (type === "donor" && serverType === "charity") {
            return {
              success: false,
              error:
                "This email is registered as a charity / organization account. Please use the charity / organization dashboard to log in.",
              errorType: "other",
            };
          }

          // Prevent donor accounts from logging into the charity login
          if (type === "charity" && serverType === "donor") {
            return {
              success: false,
              error:
                "This email is registered as a donor account. Only approved charities and organizations can log in here.",
              errorType: "other",
            };
          }

          // Prepare user profile
          const userProfile: UserProfile = {
            id: data.user.id,
            name: getPreferredDisplayName(
              String(data.user.full_name || data.user.name || ""),
              String(data.user.email || ""),
              "User"
            ),
            email: String(data.user.email || ""),
            avatar_url: (data.user.avatar_url as string | null | undefined) ?? null,
            type: serverType,
            phone: data.user.phone,
            zipCode: data.user.zip_code || data.user.zipCode,
            collegeAttended: data.user.college_attended || data.user.collegeAttended,
            charityName: data.user.charity_name || data.user.charityName,
            charityCategory: data.user.charity_category || data.user.charityCategory,
            charityDescription: data.user.charity_description || data.user.charityDescription,
            charityUrl: data.user.charity_url || data.user.charityUrl,
          };

          // Save tokens and user data
          await Promise.all([
            AsyncStorage.setItem(TOKEN_KEY, data.accessToken),
            AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken || ""),
            AsyncStorage.setItem(USER_KEY, JSON.stringify(userProfile)),
          ]);

          setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
          setUser(userProfile);
          setAvatarUrl(data.user.avatar_url || null);
          // donation summary: useEffect runs refreshDonationSummary when session + donor user are set
          console.log("✅ Login successful for:", userProfile.email);
          return { success: true };
        }

        return { success: false, error: "Login failed", errorType: "other" };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log("Login error:", message);
        
        if (isNetworkError(message)) {
          if (attempt === 0) { 
            await new Promise(r => setTimeout(r, 1000)); 
            continue; 
          }
          return { success: false, error: "Unable to connect. Please check your internet connection and try again.", errorType: "network" };
        }
        
        if (message.includes("Invalid credentials") || message.includes("Invalid email")) {
          return { success: false, error: "Invalid email or password. Please try again.", errorType: "invalid_credentials" };
        }
        
        if (attempt === 0) { 
          await new Promise(r => setTimeout(r, 1000)); 
          continue; 
        }
        
        return { success: false, error: message, errorType: "other" };
      }
    }
    return { success: false, error: "Unable to connect. Please check your internet connection and try again.", errorType: "network" };
  }

  function isAutoGeneratedName(name: string, email: string): boolean {
    const n = name.trim();
    if (!n || n === "User") return true;
    const emailLocal = (email.split("@")[0] || "").toLowerCase();
    if (emailLocal && n.toLowerCase() === emailLocal) return true;
    return false;
  }

  async function persistDonorAuthPayload(data: Record<string, unknown>): Promise<boolean> {
    if (!data.accessToken || !data.user) return false;
    const raw = data.user as Record<string, unknown>;
    const serverType: "donor" | "charity" =
      raw.type === "charity" || raw.role === "charity_owner" ? "charity" : "donor";
    if (serverType !== "donor") {
      Alert.alert(
        "Sign-in",
        "This email is registered as a charity or organization account. Use the charity login from the welcome screen."
      );
      return false;
    }
    const email = String(raw.email || "");
    const name = String(raw.full_name || raw.name || "User");
    const userProfile: UserProfile = {
      id: String(raw.id),
      name: getPreferredDisplayName(
        String(raw.full_name || raw.name || ""),
        String(raw.email || ""),
        "User"
      ),
      email: String(raw.email || ""),
      avatar_url: (raw.avatar_url as string | null | undefined) ?? null,
      type: "donor",
      phone: raw.phone as string | undefined,
      zipCode: (raw.zip_code || raw.zipCode) as string | undefined,
      collegeAttended: (raw.college_attended ?? raw.collegeAttended) as boolean | undefined,
      charityName: raw.charity_name as string | undefined,
      charityCategory: raw.charity_category as string | undefined,
      charityDescription: raw.charity_description as string | undefined,
      charityUrl: raw.charity_url as string | undefined,
    };
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, String(data.accessToken)),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, (data.refreshToken as string) || ""),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(userProfile)),
    ]);
    setSession({ accessToken: String(data.accessToken), refreshToken: (data.refreshToken as string | null) ?? null });
    setUser(userProfile);
    setAvatarUrl((raw.avatar_url as string | null | undefined) ?? null);
    if (isAutoGeneratedName(name, email)) {
      setNeedsDisplayName(true);
    }
    return true;
  }

  async function saveDisplayName(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const baseUrl = getApiUrl().replace(/\/$/, "");
      const token = session?.accessToken;
      await fetch(`${baseUrl}/api/me/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch {
      // non-fatal: name is saved locally regardless
    }
    setUser((prev) => (prev ? { ...prev, name: trimmed } : prev));
    if (user) {
      const updated = { ...user, name: trimmed };
      AsyncStorage.setItem(USER_KEY, JSON.stringify(updated)).catch(() => {});
    }
    setNeedsDisplayName(false);
  }

  function dismissDisplayNamePrompt() {
    setNeedsDisplayName(false);
  }

  function mapOAuthHttpError(status: number, payload: Record<string, unknown>): { error: string; errorType: OAuthLoginErrorType } {
    const msg = typeof payload.error === "string" ? payload.error : "";
    if (status === 404) {
      return {
        error:
          !msg || msg === "Not Found"
            ? "API not found. Check EXPO_PUBLIC_API_URL matches your server (e.g. https://giveblackapp.com/app if the API is under /app)."
            : msg,
        errorType: "other",
      };
    }
    if (status === 503) {
      return {
        error: msg || "This sign-in method is not configured on the server.",
        errorType: "not_configured",
      };
    }
    if (status === 409) {
      return { error: msg || "An account with this email already exists.", errorType: "conflict" };
    }
    if (status === 401 || status === 403) {
      return { error: msg || "Sign-in failed.", errorType: "invalid_credentials" };
    }
    return { error: msg || "Sign-in failed.", errorType: "other" };
  }

  function mapOAuthCatch(e: unknown): { error: string; errorType: OAuthLoginErrorType } {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "cancelled") {
      return { error: "", errorType: "cancelled" };
    }
    if (isNetworkError(message)) {
      return { error: "Unable to connect. Please check your internet connection and try again.", errorType: "network" };
    }
    return { error: message, errorType: "other" };
  }

  async function loginWithGoogle(): Promise<{ success: boolean; error?: string; errorType?: OAuthLoginErrorType }> {
    setIsGuest(false);
    try {
      const oauthGoogle = await import("@/lib/oauth-google");
      const getGoogleOAuthCredentials = oauthGoogle.getGoogleOAuthCredentials;
      if (typeof getGoogleOAuthCredentials !== "function") {
        throw new Error("Google OAuth failed to load (getGoogleOAuthCredentials missing). Rebuild the native app.");
      }
      const { idToken, profilePhotoUrl } = await getGoogleOAuthCredentials();
      const baseUrl = getApiUrl().replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/auth/oauth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          ...(profilePhotoUrl ? { pictureUrl: profilePhotoUrl } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        const m = mapOAuthHttpError(response.status, payload);
        return { success: false, error: m.error, errorType: m.errorType };
      }
      const ok = await persistDonorAuthPayload(payload);
      return ok ? { success: true } : { success: false, error: "Could not complete sign-in.", errorType: "other" };
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      if (
        raw.includes("RNGoogleSignin") ||
        raw.includes("TurboModuleRegistry") ||
        raw.includes("could not be found")
      ) {
        return {
          success: false,
          error:
            "Google Sign-In needs a dev or production build with native code (expo run:ios / run:android or EAS). It does not run in Expo Go.",
          errorType: "other",
        };
      }
      if (isGoogleSignInUserCancelled(e)) {
        return { success: false, error: "", errorType: "cancelled" };
      }
      const m = mapOAuthCatch(e);
      return { success: false, error: m.error, errorType: m.errorType };
    }
  }

  async function loginWithApple(): Promise<{ success: boolean; error?: string; errorType?: OAuthLoginErrorType }> {
    if (Platform.OS !== "ios") {
      return { success: false, error: "Apple Sign-In is only available on iOS.", errorType: "other" };
    }
    setIsGuest(false);
    try {
      const oauthApple = await import("@/lib/oauth-apple");
      const getAppleOAuthPayload = oauthApple.getAppleOAuthPayload;
      if (typeof getAppleOAuthPayload !== "function") {
        throw new Error("Apple OAuth failed to load. Rebuild the native app.");
      }
      const { identityToken, fullName } = await getAppleOAuthPayload();
      const baseUrl = getApiUrl().replace(/\/$/, "");
      const body: Record<string, string> = { identityToken };
      if (fullName) body.fullName = fullName;
      const response = await fetch(`${baseUrl}/api/auth/oauth/apple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        const m = mapOAuthHttpError(response.status, payload);
        return { success: false, error: m.error, errorType: m.errorType };
      }
      const ok = await persistDonorAuthPayload(payload);
      return ok ? { success: true } : { success: false, error: "Could not complete sign-in.", errorType: "other" };
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "ERR_REQUEST_CANCELED") {
        return { success: false, error: "", errorType: "cancelled" };
      }
      const m = mapOAuthCatch(e);
      return { success: false, error: m.error, errorType: m.errorType };
    }
  }

  async function signUpDonor(data: { name: string; email: string; password: string; zipCode: string; collegeAttended: boolean }): Promise<boolean> {
    if (!data.name.trim() || !data.email.trim() || !data.password.trim()) {
      Alert.alert("Error", "Please fill in all required fields");
      return false;
    }

    if (data.password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return false;
    }

    // Clear any existing guest session
    setIsGuest(false);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await apiCall("/api/auth/signup/donor", "POST", {
          name: data.name.trim(),
          email: data.email.trim().toLowerCase(),
          password: data.password,
          zipCode: data.zipCode.trim(),
          collegeAttended: data.collegeAttended,
        });

        if (result.success || result.user) {
          console.log("✅ Signup successful, auto-logging in...");
          // Auto-login after successful signup
          const loginResult = await login(data.email, data.password, "donor");
          if (loginResult.success) {
            console.log("✅ Auto-login successful");
            return true;
          } else {
            Alert.alert("Success", "Account created! Please log in.", [
              { text: "OK", onPress: () => router.replace("/(auth)/donor-login") }
            ]);
            return true;
          }
        }

        Alert.alert("Sign Up Error", "Failed to create account");
        return false;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log("Signup error:", message);
        
        if (isNetworkError(message)) {
          if (attempt === 0) { 
            await new Promise(r => setTimeout(r, 1000)); 
            continue; 
          }
          Alert.alert("Connection Error", "Unable to connect. Please check your internet connection and try again.");
          return false;
        }
        
        if (message.includes("already in use") || message.includes("already registered") || message.includes("already exists")) {
          Alert.alert("Account Exists", "An account with this email already exists. Please log in instead.", [
            { text: "Cancel" },
            { text: "Log In", onPress: () => router.replace("/(auth)/donor-login") }
          ]);
          return false;
        }
        
        if (attempt === 0) { 
          await new Promise(r => setTimeout(r, 1000)); 
          continue; 
        }
        
        Alert.alert("Sign Up Error", message);
        return false;
      }
    }
    Alert.alert("Connection Error", "Unable to connect. Please check your internet connection and try again.");
    return false;
  }

  async function signUpCharity(data: {
    charityName: string;
    category: string;
    categoryId?: string;
    description: string;
    url: string;
    name: string;
    email: string;
    password: string;
    bank_name?: string;
    account_holder_name?: string;
    routing_number?: string;
    account_last4?: string;
    account_number?: string;
    tax_id?: string;
  }): Promise<boolean> {
    if (!data.name.trim() || !data.email.trim() || !data.password.trim()) {
      Alert.alert("Error", "Please fill in all required fields");
      return false;
    }

    if (data.password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return false;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await apiCall("/api/auth/signup/charity", "POST", {
          name: data.name.trim(),
          email: data.email.trim().toLowerCase(),
          password: data.password,
          charityName: data.charityName,
          category: data.category,
          ...(data.categoryId ? { categoryId: data.categoryId } : {}),
          description: data.description,
          url: data.url,
          ...(data.bank_name ? { bank_name: data.bank_name } : {}),
          ...(data.account_holder_name ? { account_holder_name: data.account_holder_name } : {}),
          ...(data.routing_number ? { routing_number: data.routing_number } : {}),
          ...(data.account_last4 ? { account_last4: data.account_last4 } : {}),
          ...(data.account_number ? { account_number: data.account_number } : {}),
          ...(data.tax_id ? { tax_id: data.tax_id } : {}),
        });

        if (result.success) {
          return true;
        }

        Alert.alert("Sign Up Error", "Failed to create charity account");
        return false;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        
        if (isNetworkError(message)) {
          if (attempt === 0) { 
            await new Promise(r => setTimeout(r, 1000)); 
            continue; 
          }
          Alert.alert("Connection Error", "Unable to connect. Please check your internet connection and try again.");
          return false;
        }
        
        if (message.includes("already in use") || message.includes("already registered")) {
          Alert.alert("Account Exists", "An account with this email already exists.");
          return false;
        }
        
        if (attempt === 0) { 
          await new Promise(r => setTimeout(r, 1000)); 
          continue; 
        }
        
        Alert.alert("Sign Up Error", message);
        return false;
      }
    }
    Alert.alert("Connection Error", "Unable to connect. Please check your internet connection and try again.");
    return false;
  }

  async function requestResetCode(email: string): Promise<{ success: boolean; error?: string; rateLimited?: boolean }> {
    if (!email.trim()) {
      return { success: false, error: "Please enter your email address" };
    }
    try {
      const baseUrl = getApiUrl().replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (response.status === 429) {
        const data = await response.json();
        return { success: false, error: data.error || "Too many requests. Please try again later.", rateLimited: true };
      }
      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Failed to send reset code" };
      }
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (isNetworkError(message)) {
        return { success: false, error: "Unable to connect. Please check your internet connection." };
      }
      return { success: false, error: message };
    }
  }

  async function confirmResetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!email.trim() || !code.trim() || !newPassword.trim()) {
      return { success: false, error: "All fields are required" };
    }
    if (newPassword.length < 6) {
      return { success: false, error: "Password must be at least 6 characters" };
    }
    try {
      const baseUrl = getApiUrl().replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
          newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || "Failed to reset password" };
      }
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (isNetworkError(message)) {
        return { success: false, error: "Unable to connect. Please check your internet connection." };
      }
      return { success: false, error: message };
    }
  }

  function updateProfile(data: Partial<UserProfile>) {
    setUser((prev) => (prev ? { ...prev, ...data } : prev));
    // Update stored user data
    if (user) {
      const updated = { ...user, ...data };
      AsyncStorage.setItem(USER_KEY, JSON.stringify(updated)).catch(() => {});
    }
  }

  async function guestLogin() {
    console.log("🔓 Guest login initiated");
    let guestId: string | null = null;
    try {
      guestId = await AsyncStorage.getItem("@gb_guest_id");
    } catch (e: unknown) {
      console.log("Failed to read guest ID:", e instanceof Error ? e.message : String(e));
    }
    if (!guestId) {
      guestId = "guest-" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
      try {
        await AsyncStorage.setItem("@gb_guest_id", guestId);
        console.log("Guest ID created:", guestId);
      } catch (e: unknown) {
        console.log("Failed to store guest ID:", e instanceof Error ? e.message : String(e));
      }
    } else {
      console.log("✅ Existing guest ID restored:", guestId);
    }
    setUser({
      id: guestId,
      name: "Guest",
      email: "",
      type: "donor",
    });
    setIsGuest(true);
    setSession(null);
  }

  async function logout() {
    console.log("🔒 Logout initiated");
    try {
      const refreshToken = session?.refreshToken;
      if (refreshToken && !isGuest) {
        try {
          await apiCall("/api/auth/logout", "POST", { refreshToken });
          console.log("✅ Backend session invalidated");
        } catch (e) {
          console.log("⚠️ Backend logout failed (continuing local logout):", e);
        }
      }
      
      // Clear all stored data
      await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
      console.log("✅ Local storage cleared");
    } catch (e) {
      console.log("❌ Logout error:", e);
    }
    
    setUser(null);
    setSession(null);
    setIsGuest(false);
    setDonationSummary(null);
    setPendingDonationCount(0);
    console.log("✅ Logout complete");
  }

  const fetchWithAuth = useCallback(
    async (pathOrUrl: string, init?: RequestInit): Promise<Response> => {
      const baseUrl = getApiUrl().replace(/\/$/, "");
      const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
      const accessToken = session?.accessToken;
      const hadToken = Boolean(accessToken);

      const mergeHeaders = (bearer: string | undefined): Headers => {
        const h = new Headers(init?.headers as HeadersInit | undefined);
        if (init?.body instanceof FormData) {
          h.delete("Content-Type");
        }
        if (bearer) {
          h.set("Authorization", `Bearer ${bearer}`);
        }
        return h;
      };

      let response = await fetch(url, {
        ...init,
        headers: mergeHeaders(accessToken),
      });

      if (response.status === 401 && hadToken) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          response = await fetch(url, {
            ...init,
            headers: mergeHeaders(newToken),
          });
        } else {
          await logout();
          throw new Error("Session expired. Please sign in again.");
        }
      }

      if (response.status === 401 && hadToken) {
        await logout();
        throw new Error("Session expired. Please sign in again.");
      }

      return response;
    },
    [session]
  );

  const refreshDonationSummary = useCallback(async (): Promise<DonationSummary | null> => {
    if (!session?.accessToken) {
      setDonationSummary(null);
      return null;
    }
    if (user?.type !== "donor") {
      setDonationSummary(null);
      return null;
    }
    try {
      const res = await fetchWithAuth("/api/me/donations/summary");
      if (res.ok) {
        const summaryJson = (await res.json()) as DonationSummary;
        setDonationSummary(summaryJson);
        return summaryJson;
      }
    } catch {
      // non-fatal
    }
    return null;
  }, [session?.accessToken, user?.type, user?.id, fetchWithAuth]);

  const refreshPendingDonationCount = useCallback(async () => {
    if (!session?.accessToken || user?.type !== "donor") {
      setPendingDonationCount(0);
      return;
    }
    try {
      const res = await fetchWithAuth("/api/me/donations/pending-count");
      if (res.ok) {
        const json = (await res.json()) as { pending_count: number };
        setPendingDonationCount(json.pending_count ?? 0);
      }
    } catch {
      // non-fatal
    }
  }, [session?.accessToken, user?.type, user?.id, fetchWithAuth]);

  useEffect(() => {
    if (session?.accessToken && user?.type === "donor") {
      void refreshDonationSummary();
      void refreshPendingDonationCount();
    }
  }, [session?.accessToken, user?.type, user?.id, refreshDonationSummary, refreshPendingDonationCount]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!user && (!!session || isGuest),
        isGuest,
        avatarUrl,
        setAvatarUrl: setAvatarUrlAndPersist,
        donationSummary,
        refreshDonationSummary,
        pendingDonationCount,
        refreshPendingDonationCount,
        needsDisplayName,
        saveDisplayName,
        dismissDisplayNamePrompt,
        login,
        loginWithGoogle,
        loginWithApple,
        guestLogin,
        signUpDonor,
        signUpCharity,
        requestResetCode,
        confirmResetPassword,
        updateProfile,
        logout,
        fetchWithAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
