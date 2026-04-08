import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiPatch, getApiUrl } from "@/lib/query-client";
import { useAuth } from "./AuthContext";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "success" | "info" | "new" | "warning";
  read: boolean;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  description?: string;
  raised: number;
  goal: number;
  donor_count?: number;
  donorCount?: number;
  categoryId?: string;
  category_id?: string;
  featured?: boolean;
  image_url?: string;
  imageUrl?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  initials?: string;
  image_color?: string;
  imageColor?: string;
}

export interface Campaign {
  id: string;
  title: string;
  description?: string;
  story?: string;
  about?: string;
  mainImageUrl?: string;
  location?: string;
  goal: number;
  raised: number;
  donorCount: number;
  status: string;
  organizationId: string;
  orgName: string;
  orgImageUrl?: string;
  orgInitials?: string;
  orgImageColor?: string;
  orgVerified?: boolean;
  categoryId?: string;
  createdAt?: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  count?: number;
  image_url?: string;
  imageUrl?: string;
  /** App category list: circle background behind image / letter */
  iconBgColor?: string;
  /** App category list: circle border */
  iconBorderColor?: string;
}

const FAVORITES_KEY = "giveblack_favorites";

interface AppContextValue {
  organizations: Organization[];
  campaigns: Campaign[];
  categories: Category[];
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  totalDonated: number;
  walletBalance: number;
  isOffline: boolean;
  userProfile: { fullName?: string; pinHash?: string; [key: string]: unknown };
  updateProfile: (data: Partial<{ fullName?: string; [key: string]: unknown }>) => void;
  setPinHash: (hash: string | null) => Promise<void> | void;
  transactions: Array<{
    id: string;
    amount: number;
    title?: string;
    type?: string;
    date?: string;
    org_name?: string;
    [key: string]: unknown;
  }>;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationRead: (id: string) => Promise<void>;
  topUpWallet: (amount: number, paymentMethodId?: string) => Promise<boolean>;
  savedCards: Array<{ id: string; last4?: string; [key: string]: unknown }>;
  addCard: (card: { last4?: string; [key: string]: unknown }) => void;
  verifyPin: (pin: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const AVATAR_COLORS = [
  "#2E7D32", "#1565C0", "#6A1B9A", "#00695C", "#BF360C",
  "#4527A0", "#AD1457", "#37474F", "#558B2F", "#0277BD",
];

function getInitialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const skip = new Set(["of", "for", "the", "and", "in", "at", "a", "an", "to"]);
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0 && !skip.has(w.toLowerCase()));
  if (words.length === 0) return trimmed.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getImgBase(): string {
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (envUrl && !envUrl.includes("localhost")) return envUrl;
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${host}:5000`;
  }
  return envUrl;
}

function resolveImg(url: unknown): string | undefined {
  if (url == null) return undefined;
  const s = String(url);
  if (!s) return undefined;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  const base = getImgBase();
  return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
}

function normalizeOrg(raw: Record<string, unknown>): Organization {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    description: raw.description != null ? String(raw.description) : undefined,
    raised: Number(raw.raised ?? 0),
    goal: Number(raw.goal ?? 0),
    donor_count: raw.donor_count != null ? Number(raw.donor_count) : undefined,
    donorCount: raw.donor_count != null ? Number(raw.donor_count) : (raw.donorCount != null ? Number(raw.donorCount) : undefined),
    categoryId: raw.category_id != null ? String(raw.category_id) : raw.categoryId != null ? String(raw.categoryId) : undefined,
    category_id: raw.category_id != null ? String(raw.category_id) : undefined,
    featured: Boolean(raw.featured),
    image_url: resolveImg(raw.image_url),
    imageUrl: resolveImg(raw.image_url ?? raw.imageUrl),
    thumbnail_url: resolveImg(raw.thumbnail_url),
    thumbnailUrl: resolveImg(raw.thumbnail_url ?? raw.thumbnailUrl),
    initials: raw.initials != null ? String(raw.initials) : getInitialsFromName(String(raw.name ?? "")),
    image_color: raw.image_color != null ? String(raw.image_color) : getAvatarColor(String(raw.id ?? raw.name ?? "")),
    imageColor: raw.image_color != null ? String(raw.image_color) : raw.imageColor != null ? String(raw.imageColor) : getAvatarColor(String(raw.id ?? raw.name ?? "")),
  };
}

function normalizeCampaign(raw: Record<string, unknown>): Campaign {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    description: raw.description != null ? String(raw.description) : undefined,
    story: raw.story != null ? String(raw.story) : undefined,
    about: raw.about != null ? String(raw.about) : undefined,
    mainImageUrl: resolveImg(raw.main_image_url),
    location: raw.location != null ? String(raw.location) : undefined,
    goal: Number(raw.goal ?? 0),
    raised: Number(raw.raised ?? 0),
    donorCount: Number(raw.donor_count ?? 0),
    status: String(raw.status ?? "active"),
    organizationId: String(raw.organization_id ?? ""),
    orgName: String(raw.org_name ?? ""),
    orgImageUrl: resolveImg(raw.org_image_url),
    orgInitials: raw.org_initials != null ? String(raw.org_initials) : undefined,
    orgImageColor: raw.org_image_color != null ? String(raw.org_image_color) : undefined,
    orgVerified: raw.org_verified != null ? Boolean(raw.org_verified) : undefined,
    categoryId: raw.category_id != null ? String(raw.category_id) : undefined,
    createdAt: raw.created_at != null ? String(raw.created_at) : undefined,
  };
}

/** Accept snake_case or camelCase from API; normalize hex for React Native. */
function pickHexColor(raw: Record<string, unknown>, snake: string, camel: string): string | undefined {
  const v = raw[snake] ?? raw[camel];
  if (v == null) return undefined;
  let s = String(v).trim();
  if (!s) return undefined;
  if (!s.startsWith("#")) {
    if (/^[0-9a-fA-F]{6}$/.test(s)) s = `#${s}`;
    else if (/^[0-9a-fA-F]{3}$/.test(s)) s = `#${s}`;
  }
  return s;
}

function normalizeCat(raw: Record<string, unknown>): Category {
  const img = resolveImg(raw.image_url ?? raw.imageUrl);
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    icon: raw.icon != null ? String(raw.icon) : undefined,
    color: raw.color != null ? String(raw.color).trim() : undefined,
    count: raw.count != null ? Number(raw.count) : undefined,
    image_url: raw.image_url != null ? String(raw.image_url) : undefined,
    imageUrl: img,
    iconBgColor: pickHexColor(raw, "icon_bg_color", "iconBgColor"),
    iconBorderColor: pickHexColor(raw, "icon_border_color", "iconBorderColor"),
  };
}

const NOTIF_TYPES = new Set(["success", "info", "new", "warning"]);

function normalizeNotification(raw: Record<string, unknown>): AppNotification {
  const t = String(raw.type ?? "info");
  const type = NOTIF_TYPES.has(t) ? (t as AppNotification["type"]) : "info";
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    message: String(raw.message ?? ""),
    type,
    read: Boolean(raw.read),
    created_at: String(raw.created_at ?? new Date().toISOString()),
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user, session, refreshDonationSummary, fetchWithAuth, donationSummary } = useAuth();
  const userId = user?.id || "guest";
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [userProfile, setUserProfile] = useState<{ fullName?: string; pinHash?: string; [key: string]: unknown }>({});
  const [transactions, setTransactions] = useState<
    Array<{ id: string; amount: number; title?: string; type?: string; date?: string; org_name?: string; [key: string]: unknown }>
  >([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [savedCards, setSavedCards] = useState<Array<{ id: string; last4?: string; [key: string]: unknown }>>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const profileKey = `giveblack_profile_${userId}`;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(profileKey);
        if (raw) {
          const saved = JSON.parse(raw);
          setUserProfile((prev) => ({ ...prev, ...saved }));
        }
      } catch {}
    })();
  }, [profileKey]);

  // User-specific favorites key
  const favoritesKey = `${FAVORITES_KEY}_${userId}`;

  const loadFavorites = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(favoritesKey);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      setFavorites(Array.isArray(list) ? list : []);
      console.log(`✅ Loaded ${list.length} favorites for user: ${userId}`);
    } catch {
      setFavorites([]);
    }
  }, [favoritesKey, userId]);

  const saveFavorites = useCallback((list: string[]) => {
    setFavorites(list);
    AsyncStorage.setItem(favoritesKey, JSON.stringify(list));
    console.log(`💾 Saved ${list.length} favorites for user: ${userId}`);
  }, [favoritesKey, userId]);

  // Reload favorites when user changes
  useEffect(() => {
    loadFavorites();
  }, [userId, loadFavorites]);

  const accessToken = session?.accessToken;

  const refresh = useCallback(async () => {
    const base = getApiUrl().replace(/\/$/, "");
    if (!accessToken) {
      setNotifications([]);
      setTransactions([]);
    }
    try {
      const pubPromise = Promise.all([
        fetch(`${base}/api/organizations`),
        fetch(`${base}/api/campaigns`),
        fetch(`${base}/api/categories`),
      ]);
      const authPromise = accessToken
        ? Promise.all([
            fetchWithAuth("/api/notifications"),
            fetchWithAuth("/api/account/transactions"),
          ])
        : Promise.resolve<[null, null]>([null, null]);

      const [[orgRes, campRes, catRes], authPair] = await Promise.all([pubPromise, authPromise]);
      const [notifRes, txRes] = authPair;
      
      if (orgRes.ok) {
        const data: Record<string, unknown> = await orgRes.json();
        const list = Array.isArray(data) ? data : Array.isArray(data.organizations) ? data.organizations : Array.isArray(data.data) ? data.data : [];
        setOrganizations((list as Record<string, unknown>[]).map(normalizeOrg));
      }

      if (campRes.ok) {
        const data: Record<string, unknown> = await campRes.json();
        const list = Array.isArray(data) ? data : Array.isArray(data.campaigns) ? data.campaigns : Array.isArray(data.data) ? data.data : [];
        setCampaigns((list as Record<string, unknown>[]).map(normalizeCampaign));
      }
      
      if (catRes.ok) {
        const data: Record<string, unknown> = await catRes.json();
        const list = Array.isArray(data) ? data : Array.isArray(data.categories) ? data.categories : Array.isArray(data.data) ? data.data : [];
        setCategories((list as Record<string, unknown>[]).map(normalizeCat));
      }

      if (notifRes?.ok) {
        const data = await notifRes.json() as { notifications: Record<string, unknown>[] };
        const list = Array.isArray(data.notifications) ? data.notifications : [];
        setNotifications(list.map((n) => normalizeNotification(n)));
      }

      if (txRes?.ok) {
        const data = await txRes.json() as {
          transactions?: Array<{
            id: string;
            amount: number;
            title?: string;
            type?: string;
            date?: string;
            org_name?: string;
            [key: string]: unknown;
          }>;
        };
        const normalized = Array.isArray(data.transactions)
          ? data.transactions.map((t) => ({
              ...t,
              id: String(t.id ?? ""),
              amount: Number(t.amount ?? 0),
              title: String(t.title ?? "Transaction"),
              type: t.type ? String(t.type) : "transaction",
              date: t.date ? String(t.date) : new Date().toISOString(),
              org_name: t.org_name ? String(t.org_name) : undefined,
            }))
          : [];
        setTransactions(normalized);
      }
      
      setIsOffline(false);
    } catch {
      setIsOffline(true);
    }
    await refreshDonationSummary();
  }, [accessToken, refreshDonationSummary, fetchWithAuth]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const wsBase = getApiUrl().replace(/\/$/, "");
    const wsUrl = wsBase.replace(/^http/, "ws");
    // Public realtime channel for campaign updates.
    const socket = new WebSocket(`${wsUrl}/ws?channels=campaign_updates&token=public`);
    wsRef.current = socket;
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { channel?: string };
        if (payload.channel === "campaign_updates") {
          void refresh();
        }
      } catch {
        // ignore malformed payloads
      }
    };
    const poll = setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      clearInterval(poll);
      socket.close();
      wsRef.current = null;
    };
  }, [refresh]);

  const markNotificationRead = useCallback(
    async (id: string) => {
      if (!accessToken || !id) return;
      let snapshotForRevert: AppNotification[] | null = null;
      setNotifications((p) => {
        const target = p.find((n) => n.id === id);
        if (!target || target.read) return p;
        snapshotForRevert = p;
        return p.map((n) => (n.id === id ? { ...n, read: true } : n));
      });
      if (snapshotForRevert === null) return;
      try {
        await apiPatch<{ success?: boolean }>(
          `/api/notifications/${encodeURIComponent(id)}/read`,
          {},
          accessToken
        );
      } catch {
        setNotifications(snapshotForRevert);
      }
    },
    [accessToken]
  );

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const isFavorite = useCallback((orgId: string) => favorites.includes(orgId), [favorites]);
  const toggleFavorite = useCallback((orgId: string) => {
    saveFavorites(
      favorites.includes(orgId) ? favorites.filter((id) => id !== orgId) : [...favorites, orgId]
    );
  }, [favorites, saveFavorites]);

  const txTotal = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalDonated =
    user?.type === "donor" && donationSummary != null
      ? donationSummary.total_amount_cents / 100
      : txTotal;

  const value: AppContextValue = {
    organizations,
    campaigns,
    categories,
    favorites,
    isFavorite,
    toggleFavorite,
    totalDonated,
    walletBalance,
    isOffline,
    userProfile,
    updateProfile: (data) => {
      setUserProfile((prev) => {
        const updated = { ...prev, ...data };
        AsyncStorage.setItem(profileKey, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    },
    setPinHash: async (pin: string | null) => {
      const hash = pin ? btoa(pin) : null;
      setUserProfile((prev) => {
        const updated = { ...prev, pinHash: hash || undefined };
        AsyncStorage.setItem(profileKey, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    },
    transactions,
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    topUpWallet: async (amount: number) => {
      setWalletBalance((prev) => prev + amount);
      setTransactions((prev) => [
        { id: String(Date.now()), amount, title: "Wallet top-up", type: "topup", date: new Date().toISOString() },
        ...prev,
      ]);
      return true;
    },
    savedCards,
    addCard: (card) => setSavedCards((c) => [...c, { id: String(Date.now()), ...card }]),
    verifyPin: async (pin: string) => {
      if (!userProfile.pinHash) return true;
      return btoa(pin) === userProfile.pinHash;
    },
    refresh,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (ctx === undefined) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
