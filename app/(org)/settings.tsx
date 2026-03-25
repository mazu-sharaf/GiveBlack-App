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
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeInsets } from "@/lib/safe-area";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

export default function SettingsTab() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { isDark, setTheme } = useTheme();
  const { user, logout, session } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [orgName, setOrgName] = useState(user?.charityName || "");
  const [orgDesc, setOrgDesc] = useState(user?.charityDescription || "");
  const [orgUrl, setOrgUrl] = useState(user?.charityUrl || "");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [orgImageUrl, setOrgImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const base = getApiUrl().replace(/\/$/, "");
  const token = session?.accessToken ?? "";

  const loadOrgProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${base}/api/org/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.org) {
          setOrgName(String(data.org.name ?? ""));
          setOrgDesc(String(data.org.description ?? ""));
          setOrgUrl(String(data.org.website ?? ""));
        }
        if (data.org?.image_url) {
          setOrgImageUrl(data.org.image_url);
        }
      }
    } catch {}
  }, [base, token]);

  useEffect(() => {
    loadOrgProfile();
  }, [loadOrgProfile]);

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

      const uploadRes = await fetch(`${base}/api/upload/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        Alert.alert("Upload Failed", err.error || "Could not upload image");
        return;
      }

      const uploadJson = await uploadRes.json();

      const updateRes = await fetch(`${base}/api/org/profile-image`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image_url: uploadJson.url }),
      });

      if (updateRes.ok) {
        setOrgImageUrl(uploadJson.url);
      } else {
        Alert.alert("Error", "Image uploaded but failed to update profile");
      }
    } catch {
      Alert.alert("Error", "Something went wrong while uploading");
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
    if (!token) {
      Alert.alert("Sign in required", "Your session is missing or expired. Please sign in again.");
      return;
    }
    try {
      const res = await fetch(`${base}/api/org/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: orgName.trim(),
          description: orgDesc.trim(),
          website: orgUrl.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Save failed", err.error || "Could not save organization profile.");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (json.org) {
        setOrgName(String(json.org.name ?? orgName));
        setOrgDesc(String(json.org.description ?? orgDesc));
        setOrgUrl(String(json.org.website ?? orgUrl));
      }
      setEditMode(false);
      Alert.alert("Saved", "Organization profile updated.");
    } catch {
      Alert.alert("Error", "Could not save organization profile.");
    }
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
              <View style={styles.editActions}>
                <Pressable
                  style={[styles.editActionBtn, { borderColor: c.border }]}
                  onPress={() => setEditMode(false)}
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
              <View style={styles.infoRow}>
                <Ionicons name="business-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Organization Name</Text>
                  <Text style={[styles.infoValue, { color: c.text }]}>{orgName || "—"}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="document-text-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Description</Text>
                  <Text style={[styles.infoValue, { color: c.text }]} numberOfLines={2}>{orgDesc || "—"}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="globe-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Website</Text>
                  <Text style={[styles.infoValue, { color: c.green }]}>{orgUrl || "—"}</Text>
                </View>
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
              const isActive =
                (opt.key === "dark" && isDark) ||
                (opt.key === "light" && !isDark);
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
    borderBottomColor: "rgba(0,0,0,0.04)",
  },
  infoLabel: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  infoValue: { fontFamily: "Poppins_500Medium", fontSize: 14, marginTop: 1 },
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
