import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import AppHeader from "@/components/AppHeader";

type CategoryOption = { id: string; name: string };

export default function OrganizationProfilePage() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { user, session, fetchWithAuth } = useAuth();

  const [orgName, setOrgName] = useState(user?.charityName || "");
  const [orgDesc, setOrgDesc] = useState(user?.charityDescription || "");
  const [orgUrl, setOrgUrl] = useState(user?.charityUrl || "");
  const [orgImageUrl, setOrgImageUrl] = useState<string | null>(null);
  const [orgCoverUrl, setOrgCoverUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [orgCategoryId, setOrgCategoryId] = useState<string | null>(null);
  const [orgCategoryName, setOrgCategoryName] = useState("");

  const base = getApiUrl().replace(/\/$/, "");

  const resolveImageUrl = useCallback(
    (url: string | null | undefined): string | undefined => {
      if (!url) return undefined;
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
    },
    [base]
  );

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
          setOrgCoverUrl(data.org.cover_image_url ? String(data.org.cover_image_url) : null);
        }
        if (data.org?.image_url) setOrgImageUrl(String(data.org.image_url));
      }
    } catch {}
  }, [session, fetchWithAuth]);

  useEffect(() => {
    void loadOrgProfile();
  }, [loadOrgProfile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/api/categories`);
        if (!res.ok) throw new Error("fail");
        const data = (await res.json()) as { categories?: unknown[] };
        const raw = Array.isArray(data.categories) ? data.categories : [];
        const list: CategoryOption[] = raw
          .map((row: unknown) => {
            const r = row as { id?: string; name?: string };
            return { id: String(r.id ?? ""), name: String(r.name ?? "").trim() };
          })
          .filter((x) => x.id && x.name);
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

  useFocusEffect(
    useCallback(() => {
      void loadOrgProfile();
    }, [loadOrgProfile])
  );

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
      const uri = asset.uri;
      const ext = uri.split(".").pop() || "jpg";
      formData.append("file", {
        uri,
        name: `profile.${ext}`,
        type: asset.mimeType || `image/${ext}`,
      } as any);

      const uploadRes = await fetchWithAuth("/api/upload/image?kind=org-logo", { method: "POST", body: formData });
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
      if (updateRes.ok) setOrgImageUrl(uploadJson.url);
      else Alert.alert("Error", "Image uploaded but failed to update profile");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong while uploading";
      Alert.alert("Error", msg);
    } finally {
      setUploadingImage(false);
    }
  }

  async function pickCoverImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    if (!session) {
      Alert.alert("Sign in required", "Please sign in to upload a cover image.");
      return;
    }

    const asset = result.assets[0];
    setUploadingCover(true);
    try {
      const formData = new FormData();
      const uri = asset.uri;
      const ext = uri.split(".").pop() || "jpg";
      formData.append("file", {
        uri,
        name: `cover.${ext}`,
        type: asset.mimeType || `image/${ext}`,
      } as any);

      const uploadRes = await fetchWithAuth("/api/upload/image?kind=org-cover", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        Alert.alert("Upload Failed", (err as { error?: string }).error || "Could not upload cover");
        return;
      }
      const uploadJson = await uploadRes.json();
      const updateRes = await fetchWithAuth("/api/org/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cover_image_url: uploadJson.url }),
      });
      if (updateRes.ok) setOrgCoverUrl(uploadJson.url);
      else Alert.alert("Error", "Cover uploaded but failed to update profile");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong while uploading";
      Alert.alert("Error", msg);
    } finally {
      setUploadingCover(false);
    }
  }

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
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Save failed", (err as { error?: string }).error || "Could not save organization profile.");
        return;
      }
      Alert.alert("Saved", "Organization profile updated.");
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save organization profile.";
      Alert.alert("Error", msg);
    }
  }

  const resolvedOrgImage = resolveImageUrl(orgImageUrl);
  const resolvedCoverImage = resolveImageUrl(orgCoverUrl);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader variant="org" title="Organization profile" showBack showSearch={false} showNotifications={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>LOGO</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <Pressable onPress={pickProfileImage} disabled={uploadingImage} style={styles.logoRow}>
            <View style={[styles.logo, { backgroundColor: c.green }]}>
              {resolvedOrgImage ? (
                <Image source={{ uri: resolvedOrgImage }} style={styles.logoImg} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <Text style={styles.logoText}>{(orgName || "O").charAt(0).toUpperCase()}</Text>
              )}
              <View style={[styles.cameraOverlay, { backgroundColor: c.green }]}>
                {uploadingImage ? <ActivityIndicator size={12} color="#fff" /> : <Ionicons name="camera" size={12} color="#fff" />}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingText, { color: c.text }]}>Upload logo</Text>
              <Text style={[styles.aboutValue, { color: c.textMuted, marginTop: 2 }]}>Square image works best</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>COVER IMAGE (OPTIONAL)</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <Pressable
            onPress={pickCoverImage}
            disabled={uploadingCover}
            style={[styles.coverUpload, { borderColor: c.border, backgroundColor: c.inputBg }]}
          >
            {resolvedCoverImage ? (
              <Image source={{ uri: resolvedCoverImage }} style={styles.coverImage} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="image-outline" size={22} color={c.textMuted} />
                <Text style={[styles.coverHint, { color: c.textMuted }]}>
                  {uploadingCover ? "Uploading…" : "Tap to upload cover image"}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>DETAILS</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
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
                else if (!categoriesLoading && categories.length === 0) Alert.alert("Categories unavailable", "Could not load categories. Try again later.");
              }}
            >
              <Text style={{ color: orgCategoryId ? c.text : c.textLight, fontFamily: "SpaceGrotesk_400Regular", fontSize: 14 }}>
                {categoriesLoading ? "Loading categories…" : orgCategoryName || "Select category"}
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

          <Pressable style={[styles.saveBtn, { backgroundColor: c.green }]} onPress={handleSaveProfile}>
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={categoryModalVisible} animationType="slide" transparent onRequestClose={() => setCategoryModalVisible(false)}>
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
                  {orgCategoryId === item.id ? <Ionicons name="checkmark-circle" size={22} color={Colors.green} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 0 },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: { borderRadius: 16, padding: 16, marginBottom: 18 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  logoImg: { width: 56, height: 56, borderRadius: 16 },
  logoText: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, color: "#fff" },
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
  settingText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  aboutValue: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13 },
  coverUpload: { borderWidth: 1, borderRadius: 16, overflow: "hidden", width: "100%", aspectRatio: 16 / 9 },
  coverPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  coverHint: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13 },
  coverImage: { width: "100%", height: "100%" },
  editField: { marginBottom: 14 },
  editLabel: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12, marginBottom: 8 },
  editInput: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "SpaceGrotesk_400Regular", fontSize: 14 },
  categoryPickerBtn: { borderWidth: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  saveBtn: { marginTop: 6, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14, color: "#fff" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "72%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16 },
  modalList: { paddingHorizontal: 12, paddingBottom: 24 },
  categoryRow: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12 },
  categoryRowText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14 },
});

