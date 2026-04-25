import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  TextInput,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeInsets } from "@/lib/safe-area";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";

type CategoryOption = { id: string; name: string };

export default function SettingsTab() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { theme, setTheme } = useTheme();
  const { user, logout, session, fetchWithAuth } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [orgName, setOrgName] = useState(user?.charityName || "");
  const [orgDesc, setOrgDesc] = useState(user?.charityDescription || "");
  const [orgUrl, setOrgUrl] = useState(user?.charityUrl || "");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [orgImageUrl, setOrgImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [orgCategoryId, setOrgCategoryId] = useState<string | null>(null);
  const [orgCategoryName, setOrgCategoryName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountLast4, setAccountLast4] = useState("");
  const [taxId, setTaxId] = useState("");
  const [stripeStatus, setStripeStatus] = useState<{
    connected: boolean;
    payouts_enabled: boolean;
  } | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);

  const base = getApiUrl().replace(/\/$/, "");

  const loadOrgProfile = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchWithAuth("/api/org/profile", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (data.org) {
          setOrgName(String(data.org.name ?? ""));
          setOrgDesc(String(data.org.description ?? ""));
          setOrgUrl(String(data.org.website ?? ""));
          setOrgCategoryId(data.org.category_id ? String(data.org.category_id) : null);
          setOrgCategoryName(String(data.org.category_name ?? ""));
          setBankName(String(data.org.bank_name ?? ""));
          setAccountHolder(String(data.org.account_holder_name ?? ""));
          setRoutingNumber(String(data.org.routing_number ?? ""));
          setAccountLast4(String(data.org.account_last4 ?? ""));
          setTaxId(String(data.org.tax_id ?? ""));
        }
        if (data.org?.image_url) {
          setOrgImageUrl(data.org.image_url);
        }
      }
    } catch {}
  }, [session, fetchWithAuth]);

  const loadConnectStatus = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchWithAuth("/api/org/connect/status", { method: "GET" });
      if (res.ok) {
        const j = (await res.json()) as { connected?: boolean; payouts_enabled?: boolean };
        setStripeStatus({
          connected: Boolean(j.connected),
          payouts_enabled: Boolean(j.payouts_enabled),
        });
      }
    } catch {
      setStripeStatus(null);
    }
  }, [session, fetchWithAuth]);

  useEffect(() => {
    loadOrgProfile();
  }, [loadOrgProfile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/api/categories`);
        if (!res.ok) throw new Error("fail");
        const data = (await res.json()) as { categories?: unknown[] };
        const raw = Array.isArray(data.categories) ? data.categories : [];
        const list: CategoryOption[] = raw.map((row: unknown) => {
          const r = row as { id?: string; name?: string };
          return { id: String(r.id ?? ""), name: String(r.name ?? "").trim() };
        }).filter((x) => x.id && x.name);
        if (!cancelled) setCategories(list.sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base]);

  useEffect(() => {
    void loadConnectStatus();
  }, [loadConnectStatus]);

  useFocusEffect(
    useCallback(() => {
      void loadConnectStatus();
    }, [loadConnectStatus])
  );

  async function openStripeOnboarding() {
    if (!session || connectBusy) return;
    setConnectBusy(true);
    try {
      const res = await fetchWithAuth("/api/org/connect/onboard", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        Alert.alert("Stripe", json.error || "Could not start Stripe onboarding.");
        return;
      }
      if (json.url) await WebBrowser.openBrowserAsync(json.url);
      await loadConnectStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Stripe", msg);
    } finally {
      setConnectBusy(false);
    }
  }

  function resolveImageUrl(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  async function pickProfileImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    if (!session) {
      Alert.alert("Sign in required", "Please sign in to upload a profile image.");
      return;
    }

    const asset = result.assets[0];
    setUploadingImage(true);

    try {
      const formData = new FormData();

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append("file", blob, `profile.${asset.uri.split(".").pop() || "jpg"}`);
      } else {
        const uri = asset.uri;
        const ext = uri.split(".").pop() || "jpg";
        formData.append("file", {
          uri,
          name: `profile.${ext}`,
          type: asset.mimeType || `image/${ext}`,
        } as any);
      }

      const uploadRes = await fetchWithAuth("/api/upload/image", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        Alert.alert("Upload Failed", (err as { error?: string }).error || "Could not upload image");
        return;
      }

      const uploadJson = await uploadRes.json();

      const updateRes = await fetchWithAuth("/api/org/profile-image", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: uploadJson.url }),
      });

      if (updateRes.ok) {
        setOrgImageUrl(uploadJson.url);
      } else {
        Alert.alert("Error", "Image uploaded but failed to update profile");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong while uploading";
      Alert.alert("Error", msg);
    } finally {
      setUploadingImage(false);
    }
  }

  function handleLogout() {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/(auth)/welcome");
          },
        },
      ]
    );
  }

  const themeOptions = [
    { key: "light", label: "Light", icon: "sunny-outline" as const },
    { key: "dark", label: "Dark", icon: "moon-outline" as const },
    { key: "system", label: "System", icon: "phone-portrait-outline" as const },
  ];

  const resolvedOrgImage = resolveImageUrl(orgImageUrl);

  async function handleSaveProfile() {
    if (!session) {
      Alert.alert("Sign in required", "Your session is missing or expired. Please sign in again.");
      return;
    }
    try {
      const res = await fetchWithAuth("/api/org/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName.trim(),
          description: orgDesc.trim(),
          website: orgUrl.trim(),
          category_id: orgCategoryId || null,
          bank_name: bankName.trim() || null,
          account_holder_name: accountHolder.trim() || null,
          routing_number: routingNumber.trim() || null,
          account_last4: accountLast4.trim() || null,
          tax_id: taxId.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = (err as { error?: string }).error || "Could not save organization profile.";
        Alert.alert(
          "Save failed",
          msg === "Unauthorized" ? "Session expired. Please sign in again." : msg
        );
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { org?: Record<string, unknown> };
      if (json.org) {
        setOrgName(String(json.org.name ?? orgName));
        setOrgDesc(String(json.org.description ?? orgDesc));
        setOrgUrl(String(json.org.website ?? orgUrl));
        setOrgCategoryId(json.org.category_id ? String(json.org.category_id) : null);
        setOrgCategoryName(String(json.org.category_name ?? ""));
        setBankName(String(json.org.bank_name ?? ""));
        setAccountHolder(String(json.org.account_holder_name ?? ""));
        setRoutingNumber(String(json.org.routing_number ?? ""));
        setAccountLast4(String(json.org.account_last4 ?? ""));
        setTaxId(String(json.org.tax_id ?? ""));
      }
      setEditMode(false);
      Alert.alert("Saved", "Organization profile updated.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save organization profile.";
      Alert.alert("Error", msg.includes("Session expired") ? msg : "Could not save organization profile.");
    }
  }

  function handleCancelEdit() {
    setEditMode(false);
    void loadOrgProfile();
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.headerTitle, { color: c.text }]}>Settings</Text>

        <View style={[styles.profileCard, { backgroundColor: c.cardBg }]}>
          <Pressable onPress={pickProfileImage} disabled={uploadingImage} style={styles.avatarWrapper}>
            {resolvedOrgImage ? (
              <Image
                source={{ uri: resolvedOrgImage }}
                style={styles.avatarImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: c.green }]}>
                <Text style={styles.avatarText}>
                  {(user?.charityName || user?.name || "O").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[styles.cameraOverlay, { backgroundColor: c.green }]}>
              {uploadingImage ? (
                <ActivityIndicator size={12} color="#fff" />
              ) : (
                <Ionicons name="camera" size={12} color="#fff" />
              )}
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: c.text }]} numberOfLines={1}>
              {user?.charityName || user?.name || "Organization"}
            </Text>
            <Text style={[styles.profileEmail, { color: c.textMuted }]} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>ORGANIZATION PROFILE</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          {editMode ? (
            <>
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: c.textMuted }]}>Organization Name</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: c.inputBg, color: c.text }]}
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder="Organization name"
                  placeholderTextColor={c.textLight}
                />
              </View>
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: c.textMuted }]}>Category</Text>
                <Pressable
                  style={[styles.editInput, styles.categoryPickerBtn, { backgroundColor: c.inputBg, borderColor: c.border }]}
                  onPress={() => {
                    if (!categoriesLoading && categories.length > 0) setCategoryModalVisible(true);
                    else if (!categoriesLoading && categories.length === 0) {
                      Alert.alert("Categories unavailable", "Could not load categories. Try again later.");
                    }
                  }}
                >
                  <Text style={{ color: orgCategoryId ? c.text : c.textLight, fontFamily: "Poppins_400Regular", fontSize: 14 }}>
                    {categoriesLoading
                      ? "Loading categories…"
                      : orgCategoryName || "Select category"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={c.textMuted} />
                </Pressable>
              </View>
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: c.textMuted }]}>Description</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: c.inputBg, color: c.text, minHeight: 80, textAlignVertical: "top" }]}
                  value={orgDesc}
                  onChangeText={setOrgDesc}
                  placeholder="Describe your organization"
                  placeholderTextColor={c.textLight}
                  multiline
                />
              </View>
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: c.textMuted }]}>Website</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: c.inputBg, color: c.text }]}
                  value={orgUrl}
                  onChangeText={setOrgUrl}
                  placeholder="https://..."
                  placeholderTextColor={c.textLight}
                  keyboardType="url"
                />
              </View>
              <Text style={[styles.editLabel, { color: c.textMuted, marginBottom: 8 }]}>Bank details</Text>
              <TextInput
                style={[styles.editInput, styles.editField, { backgroundColor: c.inputBg, color: c.text }]}
                value={bankName}
                onChangeText={setBankName}
                placeholder="Bank name"
                placeholderTextColor={c.textLight}
              />
              <TextInput
                style={[styles.editInput, styles.editField, { backgroundColor: c.inputBg, color: c.text }]}
                value={accountHolder}
                onChangeText={setAccountHolder}
                placeholder="Account holder name"
                placeholderTextColor={c.textLight}
              />
              <View style={styles.bankRow}>
                <TextInput
                  style={[styles.editInput, styles.bankHalf, { backgroundColor: c.inputBg, color: c.text }]}
                  value={routingNumber}
                  onChangeText={setRoutingNumber}
                  placeholder="Routing #"
                  placeholderTextColor={c.textLight}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.editInput, styles.bankHalf, { backgroundColor: c.inputBg, color: c.text }]}
                  value={accountLast4}
                  onChangeText={(t) => setAccountLast4(t.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Last 4"
                  placeholderTextColor={c.textLight}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <TextInput
                style={[styles.editInput, styles.editField, { backgroundColor: c.inputBg, color: c.text }]}
                value={taxId}
                onChangeText={setTaxId}
                placeholder="Tax ID / EIN (optional)"
                placeholderTextColor={c.textLight}
                autoCapitalize="characters"
              />
              <View style={[styles.stripeRow, { borderTopColor: c.border, marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Stripe payouts</Text>
                  <Text style={[styles.infoValue, { color: c.text }]}>
                    {stripeStatus == null
                      ? "…"
                      : stripeStatus.payouts_enabled
                        ? "Payouts enabled"
                        : stripeStatus.connected
                          ? "Finish setup in Stripe"
                          : "Not connected"}
                  </Text>
                </View>
                <Pressable
                  style={[styles.stripeBtn, { backgroundColor: c.green, opacity: connectBusy ? 0.7 : 1 }]}
                  onPress={openStripeOnboarding}
                  disabled={connectBusy || !session}
                >
                  {connectBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.stripeBtnText}>
                      {stripeStatus?.connected ? "Continue" : "Connect"}
                    </Text>
                  )}
                </Pressable>
              </View>
              <View style={styles.editActions}>
                <Pressable
                  style={[styles.editActionBtn, { borderColor: c.border }]}
                  onPress={handleCancelEdit}
                >
                  <Text style={[styles.editActionText, { color: c.textMuted }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.editActionBtn, { backgroundColor: c.green, borderColor: c.green }]}
                  onPress={handleSaveProfile}
                >
                  <Text style={[styles.editActionText, { color: "#fff" }]}>Save</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
                <Ionicons name="business-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Organization Name</Text>
                  <Text style={[styles.infoValue, { color: c.text }]}>{orgName || "—"}</Text>
                </View>
              </View>
              <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
                <Ionicons name="grid-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Category</Text>
                  <Text style={[styles.infoValue, { color: c.text }]}>{orgCategoryName || "—"}</Text>
                </View>
              </View>
              <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
                <Ionicons name="document-text-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Description</Text>
                  <Text style={[styles.infoValue, { color: c.text }]} numberOfLines={2}>{orgDesc || "—"}</Text>
                </View>
              </View>
              <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
                <Ionicons name="globe-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Website</Text>
                  <Text style={[styles.infoValue, { color: c.green }]}>{orgUrl || "—"}</Text>
                </View>
              </View>
              <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
                <Ionicons name="wallet-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Bank</Text>
                  <Text style={[styles.infoValue, { color: c.text }]}>
                    {!bankName && !accountHolder && !routingNumber && !accountLast4
                      ? "—"
                      : [
                          bankName || null,
                          accountHolder || null,
                          routingNumber ? `Routing ···${routingNumber.slice(-4)}` : null,
                          accountLast4 ? `Acct ···${accountLast4}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </Text>
                  {taxId ? (
                    <Text style={[styles.infoSub, { color: c.textMuted }]}>Tax ID on file</Text>
                  ) : null}
                </View>
              </View>
              <View style={[styles.stripeRow, { borderTopColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Stripe payouts</Text>
                  <Text style={[styles.infoValue, { color: c.text }]}>
                    {stripeStatus == null
                      ? "…"
                      : stripeStatus.payouts_enabled
                        ? "Payouts enabled"
                        : stripeStatus.connected
                          ? "Finish setup in Stripe"
                          : "Not connected"}
                  </Text>
                </View>
                <Pressable
                  style={[styles.stripeBtn, { backgroundColor: c.green, opacity: connectBusy ? 0.7 : 1 }]}
                  onPress={openStripeOnboarding}
                  disabled={connectBusy || !session}
                >
                  {connectBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.stripeBtnText}>
                      {stripeStatus?.connected ? "Continue" : "Connect"}
                    </Text>
                  )}
                </Pressable>
              </View>
              <Pressable
                style={[styles.editBtn, { borderColor: c.border }]}
                onPress={() => setEditMode(true)}
              >
                <Ionicons name="create-outline" size={16} color={c.text} />
                <Text style={[styles.editBtnText, { color: c.text }]}>Edit Profile</Text>
              </Pressable>
            </>
          )}
        </View>

        <Modal
          visible={categoryModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setCategoryModalVisible(false)}
        >
          <Pressable style={[styles.modalBackdrop, { backgroundColor: c.modalOverlay }]} onPress={() => setCategoryModalVisible(false)}>
            <Pressable style={[styles.modalSheet, { backgroundColor: c.background }]} onPress={(e) => e.stopPropagation()}>
              <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
                <Text style={[styles.modalTitle, { color: c.text }]}>Organization category</Text>
                <Pressable onPress={() => setCategoryModalVisible(false)} hitSlop={12}>
                  <Ionicons name="close" size={26} color={c.text} />
                </Pressable>
              </View>
              <FlatList
                data={categories}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.modalList}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.categoryRow,
                      { borderBottomColor: c.border },
                      orgCategoryId === item.id && { backgroundColor: Colors.green + "18" },
                    ]}
                    onPress={() => {
                      setOrgCategoryId(item.id);
                      setOrgCategoryName(item.name);
                      setCategoryModalVisible(false);
                    }}
                  >
                    <Text style={[styles.categoryRowText, { color: c.text }]}>{item.name}</Text>
                    {orgCategoryId === item.id ? (
                      <Ionicons name="checkmark-circle" size={22} color={Colors.green} />
                    ) : null}
                  </Pressable>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>VOLUNTEERS</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <Pressable
            style={[styles.aboutRow, { borderBottomWidth: 0 }]}
            onPress={() => router.push("/(org)/volunteers")}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="people-outline" size={20} color={c.textMuted} />
              <Text style={[styles.aboutLabel, { color: c.text }]}>Manage volunteers</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>PREFERENCES</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <View style={styles.settingRow}>
            <Ionicons name="notifications-outline" size={20} color={c.textMuted} />
            <Text style={[styles.settingText, { color: c.text }]}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: c.border, true: c.green + "60" }}
              thumbColor={notificationsEnabled ? c.green : c.textLight}
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <View style={styles.themeRow}>
            {themeOptions.map((opt) => {
              const isActive = opt.key === theme;
              return (
                <Pressable
                  key={opt.key}
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor: isActive ? c.green + "15" : "transparent",
                      borderColor: isActive ? c.green : c.border,
                    },
                  ]}
                  onPress={() => {
                    if (opt.key === "dark") setTheme("dark");
                    else if (opt.key === "light") setTheme("light");
                    else setTheme("system");
                  }}
                >
                  <Ionicons name={opt.icon} size={20} color={isActive ? c.green : c.textMuted} />
                  <Text style={[styles.themeLabel, { color: isActive ? c.green : c.textMuted }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>ABOUT</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: c.text }]}>Version</Text>
            <Text style={[styles.aboutValue, { color: c.textMuted }]}>1.0.0</Text>
          </View>
          <Pressable style={styles.aboutRow} onPress={() => router.push("/settings/terms-of-service")}>
            <Text style={[styles.aboutLabel, { color: c.text }]}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </Pressable>
          <Pressable style={styles.aboutRow} onPress={() => router.push("/settings/privacy-policy")}>
            <Text style={[styles.aboutLabel, { color: c.text }]}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </Pressable>
        </View>

        <Pressable style={[styles.logoutBtn, { borderColor: "#ef4444" }]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 12, marginBottom: 20 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 18,
    gap: 14,
    marginBottom: 24,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 16,
  },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#fff" },
  cameraOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  profileName: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  profileEmail: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 2 },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  infoValue: { fontFamily: "Poppins_500Medium", fontSize: 14, marginTop: 1 },
  infoSub: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 4 },
  stripeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stripeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  stripeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#fff" },
  categoryPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bankRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  bankHalf: { flex: 1, marginBottom: 0 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "72%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17 },
  modalList: { paddingBottom: 16 },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryRowText: { fontFamily: "Poppins_500Medium", fontSize: 16, flex: 1, paddingRight: 12 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  editBtnText: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  editField: { marginBottom: 16 },
  editLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, marginBottom: 6 },
  editInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  editActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  editActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  editActionText: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  settingText: { fontFamily: "Poppins_500Medium", fontSize: 15, flex: 1 },
  themeRow: {
    flexDirection: "row",
    gap: 8,
  },
  themeOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  themeLabel: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.04)",
  },
  aboutLabel: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  aboutValue: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 8,
  },
  logoutText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#ef4444" },
});
