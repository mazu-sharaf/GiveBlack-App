import React, { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { Ionicons } from "@expo/vector-icons";

interface Campaign {
  id: string;
  title: string;
  description: string;
  story: string;
  about: string;
  status: string;
  goal: number;
  raised: number;
  image_url?: string;
  location?: string;
}

interface SubData {
  org_id: string | null;
  subscription: {
    tier: string;
    limits: { max_community_campaigns: number; max_goal_per_campaign: number };
  };
  community_campaign_count: number;
  organization_campaign_count: number;
}

const INITIAL_FORM = {
  title: "",
  description: "",
  goal: "",
  location: "",
  image_url: "",
  story: "",
  about: "",
};

const SCREEN_H_PAD = 20;
const CARD_INNER_PAD = 14;

export default function CampaignsTab() {
  const insets = useSafeInsets();
  const { width: windowWidth } = useWindowDimensions();
  const c = useThemeColors();
  const chipPadH = windowWidth < 360 ? 10 : windowWidth < 400 ? 12 : 14;
  const chipGap = windowWidth < 360 ? 6 : 8;
  const { session, user, fetchWithAuth } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [subData, setSubData] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "paused" | "completed" | "pending_review">("all");
  const [uploading, setUploading] = useState(false);
  const [imageMode, setImageMode] = useState<"upload" | "url">("upload");
  const [galleryImages, setGalleryImages] = useState<{ id: string; image_url: string; caption: string | null; sort_order: number }[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);

  const base = getApiUrl().replace(/\/$/, "");

  const loadData = useCallback(async () => {
    if (!session) return;
    try {
      const [subRes, campRes] = await Promise.all([
        fetchWithAuth("/api/charity/my-subscription", { method: "GET" }),
        fetchWithAuth("/api/org/my-campaigns", { method: "GET" }),
      ]);
      if (subRes.ok) {
        const sub = await subRes.json();
        setSubData(sub);
      }
      if (campRes.ok) {
        const campJson = await campRes.json();
        setCampaigns(Array.isArray(campJson.campaigns) ? campJson.campaigns : []);
      }
    } catch (e) {
      console.log("Campaigns load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, fetchWithAuth]);

  useFocusEffect(
    useCallback(() => {
      if (session) loadData();
    }, [session, loadData])
  );

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const maxCampaigns = subData?.subscription.limits.max_community_campaigns ?? 1;
  const maxGoal = subData?.subscription.limits.max_goal_per_campaign ?? 5000;
  const currentCount = Math.max(subData?.organization_campaign_count ?? 0, campaigns.length);
  const canCreate = maxCampaigns === 999999 || currentCount < maxCampaigns;

  const filteredCampaigns = filter === "all" ? campaigns : campaigns.filter((c) => c.status === filter);

  function formatCampaignStatus(status: string): string {
    if (status === "pending_review") return "Pending admin approval";
    return status;
  }

  function openCreate() {
    if (!canCreate) {
      Alert.alert("Campaign Limit Reached", `Your ${subData?.subscription.tier || "free"} plan allows ${maxCampaigns} campaigns. Upgrade to create more.`);
      return;
    }
    setForm(INITIAL_FORM);
    setEditingId(null);
    setImageMode("upload");
    setGalleryImages([]);
    setShowForm(true);
  }

  async function openEdit(camp: Campaign) {
    setForm({
      title: camp.title || "",
      description: camp.description || "",
      goal: camp.goal?.toString() || "",
      location: camp.location || "",
      image_url: camp.image_url || "",
      story: camp.story || "",
      about: camp.about || "",
    });
    setEditingId(camp.id);
    setImageMode(camp.image_url ? "url" : "upload");
    setGalleryImages([]);
    setShowForm(true);

    try {
      const res = await fetchWithAuth(`/api/org/campaign-images/${camp.id}`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setGalleryImages(data.images || []);
      }
    } catch (_e) {}
  }

  function resolveImageUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const formData = new FormData();

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append("file", blob, `upload.${asset.uri.split(".").pop() || "jpg"}`);
      } else {
        const uri = asset.uri;
        const ext = uri.split(".").pop() || "jpg";
        formData.append("file", {
          uri,
          name: `upload.${ext}`,
          type: asset.mimeType || `image/${ext}`,
        } as any);
      }

      const res = await fetchWithAuth("/api/upload/image", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        setForm((f) => ({ ...f, image_url: json.url }));
        setImageMode("url");
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Upload Failed", err.error || "Could not upload image");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong while uploading";
      Alert.alert("Upload Error", msg.includes("Session expired") ? msg : "Something went wrong while uploading");
    } finally {
      setUploading(false);
    }
  }

  async function pickGalleryImage() {
    if (!editingId) {
      Alert.alert("Save First", "Please save the campaign first before adding gallery images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setGalleryUploading(true);

    try {
      const formData = new FormData();

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append("file", blob, `gallery.${asset.uri.split(".").pop() || "jpg"}`);
      } else {
        const uri = asset.uri;
        const ext = uri.split(".").pop() || "jpg";
        formData.append("file", {
          uri,
          name: `gallery.${ext}`,
          type: asset.mimeType || `image/${ext}`,
        } as any);
      }

      const uploadRes = await fetchWithAuth("/api/upload/image", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        Alert.alert("Upload Failed", err.error || "Could not upload image");
        return;
      }

      const uploadJson = await uploadRes.json();

      const addRes = await fetchWithAuth(`/api/org/campaign-images/${editingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: uploadJson.url,
          sort_order: galleryImages.length,
        }),
      });

      if (addRes.ok) {
        const addJson = await addRes.json();
        setGalleryImages((prev) => [...prev, {
          id: addJson.id,
          image_url: uploadJson.url,
          caption: null,
          sort_order: galleryImages.length,
        }]);
      } else {
        Alert.alert("Error", "Image uploaded but failed to add to gallery");
      }
    } catch (_e) {
      Alert.alert("Error", "Something went wrong");
    } finally {
      setGalleryUploading(false);
    }
  }

  async function removeGalleryImage(imageId: string) {
    try {
      const res = await fetchWithAuth(`/api/org/campaign-images/${imageId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setGalleryImages((prev) => prev.filter((img) => img.id !== imageId));
      }
    } catch (_e) {
      Alert.alert("Error", "Failed to remove image");
    }
  }

  async function saveCampaign() {
    if (!form.title.trim()) { Alert.alert("Error", "Campaign title is required"); return; }
    const goalNum = parseFloat(form.goal) || 0;
    if (goalNum <= 0) { Alert.alert("Error", "Please enter a valid goal amount"); return; }
    if (goalNum > maxGoal && maxGoal < 999999) {
      Alert.alert("Goal Exceeds Limit", `Your plan allows a maximum goal of $${maxGoal.toLocaleString()}`);
      return;
    }

    setSaving(true);
    try {
      const campaignData: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        goal: goalNum,
        location: form.location.trim() || null,
        image_url: form.image_url.trim() || null,
        story: form.story.trim() || null,
        about: form.about.trim() || null,
      };

      const path = editingId ? `/api/org/campaigns/${editingId}` : "/api/org/campaigns";
      const method = editingId ? "PUT" : "POST";

      const res = await fetchWithAuth(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignData),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const apiMsg = err.error || err.message || (res.status >= 500 ? "Server error. Please try again later." : "Failed to save campaign");
        throw new Error(apiMsg);
      }

      setShowForm(false);
      setForm(INITIAL_FORM);
      setEditingId(null);
      loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      Alert.alert(
        "Error",
        msg === "Unauthorized" || msg.includes("Session expired") ? "Session expired. Please sign in again." : msg
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(campId: string, newStatus: string) {
    try {
      const res = await fetchWithAuth(`/api/org/campaigns/${campId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Error", err.error || "Failed to update status");
      }
      loadData();
    } catch {}
  }

  async function deleteCampaign(campId: string) {
    Alert.alert("Delete Campaign", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await fetchWithAuth(`/api/org/campaigns/${campId}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              Alert.alert("Error", err.error || "Failed to delete campaign");
            }
            loadData();
          } catch {}
        },
      },
    ]);
  }

  const statusColors: Record<string, string> = {
    active: "#10b981",
    draft: "#94a3b8",
    paused: "#f59e0b",
    completed: "#6366f1",
    pending_review: "#a855f7",
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={c.green} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: c.text }]}>Campaigns</Text>
        <Pressable style={[styles.createBtn, { backgroundColor: c.green }]} onPress={openCreate}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.createBtnText}>Create</Text>
        </Pressable>
      </View>

      <View style={styles.usageAndFilters}>
        <View style={[styles.usageBar, { backgroundColor: c.cardBg }]}>
          <Text style={[styles.usageText, { color: c.textMuted }]}>
            Using <Text style={{ color: c.text, fontFamily: "Poppins_600SemiBold" }}>{currentCount}/{maxCampaigns === 999999 ? "\u221e" : maxCampaigns}</Text> campaigns
            {" \u00b7 "}Max goal: <Text style={{ color: c.text, fontFamily: "Poppins_600SemiBold" }}>${maxGoal >= 999999 ? "\u221e" : maxGoal.toLocaleString()}</Text>
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          bounces
          style={styles.filterRowScroll}
          contentContainerStyle={[
            styles.filterRowContent,
            {
              paddingLeft: CARD_INNER_PAD,
              paddingRight: 20,
            },
          ]}
        >
        {(["all", "active", "pending_review", "draft", "paused", "completed"] as const).map((f, idx, arr) => (
          <Pressable
            key={f}
            style={[
              styles.filterChip,
              idx < arr.length - 1 && { marginRight: chipGap },
              {
                backgroundColor: filter === f ? c.green : c.cardBg,
                borderColor: filter === f ? c.green : c.border,
                paddingHorizontal: chipPadH,
              },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: filter === f ? "#fff" : c.textMuted },
                ...(Platform.OS === "android" ? [styles.filterChipTextAndroid] : []),
              ]}
            >
              {f === "pending_review" ? "Pending" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.green} />}
      >
        {filteredCampaigns.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: c.cardBg }]}>
            <Ionicons name="megaphone-outline" size={40} color={c.textMuted} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No campaigns found</Text>
          </View>
        ) : (
          filteredCampaigns.map((camp) => {
            const progress = camp.goal > 0 ? Math.min((camp.raised / camp.goal) * 100, 100) : 0;
            const sColor = statusColors[camp.status] || c.textMuted;
            const imgSrc = resolveImageUrl(camp.image_url);
            return (
              <Pressable key={camp.id} style={[styles.campCard, { backgroundColor: c.cardBg }]} onPress={() => openEdit(camp)}>
                {imgSrc && (
                  <Image
                    source={{ uri: imgSrc }}
                    style={styles.campImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={camp.id}
                    transition={200}
                    placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                  />
                )}
                <View style={styles.campCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.campTitle, { color: c.text }]} numberOfLines={2}>{camp.title}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: sColor + "15" }]}>
                      <View style={[styles.statusDot, { backgroundColor: sColor }]} />
                      <Text style={[styles.statusText, { color: sColor }]} numberOfLines={2}>
                        {formatCampaignStatus(camp.status)}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.campAmounts}>
                  <Text style={[styles.campRaised, { color: c.green }]}>${camp.raised.toLocaleString()}</Text>
                  <Text style={[styles.campGoal, { color: c.textMuted }]}> raised of ${camp.goal.toLocaleString()}</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                  <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: c.green }]} />
                </View>
                <Text style={[styles.progressPercent, { color: c.textMuted }]}>{progress.toFixed(0)}% funded</Text>
                <View style={styles.campActions}>
                  {camp.status === "active" && (
                    <Pressable style={[styles.actionChip, { borderColor: "#f59e0b" }]} onPress={() => updateStatus(camp.id, "paused")}>
                      <Ionicons name="pause" size={14} color="#f59e0b" />
                      <Text style={[styles.actionChipText, { color: "#f59e0b" }]}>Pause</Text>
                    </Pressable>
                  )}
                  {camp.status === "paused" && (
                    <Pressable style={[styles.actionChip, { borderColor: "#10b981" }]} onPress={() => updateStatus(camp.id, "active")}>
                      <Ionicons name="play" size={14} color="#10b981" />
                      <Text style={[styles.actionChipText, { color: "#10b981" }]}>Resume</Text>
                    </Pressable>
                  )}
                  <Pressable style={[styles.actionChip, { borderColor: c.border }]} onPress={() => openEdit(camp)}>
                    <Ionicons name="create-outline" size={14} color={c.textMuted} />
                    <Text style={[styles.actionChipText, { color: c.textMuted }]}>Edit</Text>
                  </Pressable>
                  <Pressable style={[styles.actionChip, { borderColor: "#ef4444" }]} onPress={() => deleteCampaign(camp.id)}>
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    <Text style={[styles.actionChipText, { color: "#ef4444" }]}>Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={[{ flex: 1, backgroundColor: c.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <Pressable onPress={() => setShowForm(false)}>
              <Text style={[styles.modalCancel, { color: c.textMuted }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              {editingId ? "Edit Campaign" : "New Campaign"}
            </Text>
            <Pressable onPress={saveCampaign} disabled={saving}>
              <Text style={[styles.modalSave, { color: c.green, opacity: saving ? 0.5 : 1 }]}>
                {saving ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            {[
              { key: "title", label: "Campaign Title", placeholder: "Enter campaign title", multiline: false },
              { key: "description", label: "Short Description", placeholder: "Brief description", multiline: true },
              { key: "goal", label: "Goal Amount ($)", placeholder: "5000", multiline: false, keyboard: "numeric" as const },
              { key: "location", label: "Location (optional)", placeholder: "City, State", multiline: false },
            ].map((field) => (
              <View key={field.key} style={styles.formField}>
                <Text style={[styles.formLabel, { color: c.text }]}>{field.label}</Text>
                <TextInput
                  style={[
                    styles.formInput,
                    {
                      backgroundColor: c.inputBg,
                      color: c.text,
                      minHeight: field.multiline ? 80 : 48,
                      textAlignVertical: field.multiline ? "top" : "center",
                    },
                  ]}
                  placeholder={field.placeholder}
                  placeholderTextColor={c.textLight}
                  value={(form as any)[field.key]}
                  onChangeText={(t) => setForm((f) => ({ ...f, [field.key]: t }))}
                  multiline={field.multiline}
                  keyboardType={field.keyboard || "default"}
                />
              </View>
            ))}

            <View style={[styles.sectionDivider, { borderTopColor: c.border }]} />

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: c.text }]}>Cover Image</Text>
              <Text style={[styles.formSublabel, { color: c.textMuted }]}>
                Used as the campaign thumbnail and hero banner
              </Text>
              <View style={styles.imageModeTabs}>
                <Pressable
                  style={[
                    styles.imageModeTab,
                    {
                      backgroundColor: imageMode === "upload" ? c.green : "transparent",
                      borderColor: imageMode === "upload" ? c.green : c.border,
                    },
                  ]}
                  onPress={() => setImageMode("upload")}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={14}
                    color={imageMode === "upload" ? "#fff" : c.textMuted}
                  />
                  <Text
                    style={[
                      styles.imageModeTabText,
                      { color: imageMode === "upload" ? "#fff" : c.textMuted },
                    ]}
                  >
                    Upload
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.imageModeTab,
                    {
                      backgroundColor: imageMode === "url" ? c.green : "transparent",
                      borderColor: imageMode === "url" ? c.green : c.border,
                    },
                  ]}
                  onPress={() => setImageMode("url")}
                >
                  <Ionicons
                    name="link-outline"
                    size={14}
                    color={imageMode === "url" ? "#fff" : c.textMuted}
                  />
                  <Text
                    style={[
                      styles.imageModeTabText,
                      { color: imageMode === "url" ? "#fff" : c.textMuted },
                    ]}
                  >
                    URL
                  </Text>
                </Pressable>
              </View>

              {imageMode === "upload" ? (
                <Pressable
                  style={[styles.uploadArea, { borderColor: c.border, backgroundColor: c.inputBg }]}
                  onPress={pickImage}
                  disabled={uploading}
                >
                  {uploading ? (
                    <View style={styles.uploadContent}>
                      <ActivityIndicator size="small" color={c.green} />
                      <Text style={[styles.uploadText, { color: c.textMuted }]}>Uploading...</Text>
                    </View>
                  ) : form.image_url ? (
                    <View style={styles.uploadContent}>
                      <Image
                        source={{ uri: resolveImageUrl(form.image_url) }}
                        style={styles.previewImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                      />
                      <View style={styles.uploadOverlay}>
                        <View style={[styles.changeBtn, { backgroundColor: c.green }]}>
                          <Ionicons name="camera-outline" size={14} color="#fff" />
                          <Text style={styles.changeBtnText}>Change Image</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.uploadContent}>
                      <View style={[styles.uploadIconCircle, { backgroundColor: c.green + "12" }]}>
                        <Ionicons name="image-outline" size={28} color={c.green} />
                      </View>
                      <Text style={[styles.uploadTitle, { color: c.text }]}>
                        Tap to upload image
                      </Text>
                      <Text style={[styles.uploadHint, { color: c.textMuted }]}>
                        JPEG, PNG, or WebP up to 8 MB
                      </Text>
                    </View>
                  )}
                </Pressable>
              ) : (
                <View>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: c.inputBg, color: c.text, minHeight: 48 }]}
                    placeholder="https://example.com/image.jpg"
                    placeholderTextColor={c.textLight}
                    value={form.image_url}
                    onChangeText={(t) => setForm((f) => ({ ...f, image_url: t }))}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  {form.image_url.startsWith("http") && (
                    <Image
                      source={{ uri: form.image_url }}
                      style={styles.urlPreview}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                  )}
                </View>
              )}

              {form.image_url ? (
                <Pressable
                  style={styles.removeImageBtn}
                  onPress={() => setForm((f) => ({ ...f, image_url: "" }))}
                >
                  <Ionicons name="close-circle" size={16} color="#ef4444" />
                  <Text style={[styles.removeImageText, { color: "#ef4444" }]}>Remove image</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.sectionDivider, { borderTopColor: c.border }]} />

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: c.text }]}>Gallery Images</Text>
              <Text style={[styles.formSublabel, { color: c.textMuted }]}>
                Additional photos shown in the campaign detail page
              </Text>
              {!editingId && (
                <View style={[styles.galleryHint, { backgroundColor: c.green + "10", borderColor: c.green + "30" }]}>
                  <Ionicons name="information-circle-outline" size={16} color={c.green} />
                  <Text style={[styles.galleryHintText, { color: c.green }]}>
                    Save the campaign first to add gallery images
                  </Text>
                </View>
              )}
              {editingId && (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.galleryScroll}
                  >
                    {galleryImages.map((img) => (
                      <View key={img.id} style={styles.galleryItem}>
                        <Image
                          source={{ uri: resolveImageUrl(img.image_url) }}
                          style={styles.galleryThumb}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={img.id}
                          transition={200}
                        />
                        <Pressable
                          style={styles.galleryRemoveBtn}
                          onPress={() => removeGalleryImage(img.id)}
                        >
                          <Ionicons name="close-circle" size={22} color="#ef4444" />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable
                      style={[styles.galleryAddBtn, { borderColor: c.border, backgroundColor: c.inputBg }]}
                      onPress={pickGalleryImage}
                      disabled={galleryUploading}
                    >
                      {galleryUploading ? (
                        <ActivityIndicator size="small" color={c.green} />
                      ) : (
                        <>
                          <Ionicons name="add-circle-outline" size={28} color={c.green} />
                          <Text style={[styles.galleryAddText, { color: c.textMuted }]}>Add</Text>
                        </>
                      )}
                    </Pressable>
                  </ScrollView>
                  {galleryImages.length === 0 && !galleryUploading && (
                    <Text style={[styles.galleryEmptyText, { color: c.textMuted }]}>
                      No gallery images yet. Tap + to add photos.
                    </Text>
                  )}
                </>
              )}
            </View>

            <View style={[styles.sectionDivider, { borderTopColor: c.border }]} />

            {[
              { key: "story", label: "Story", placeholder: "Tell your campaign story...", multiline: true, tall: true },
              { key: "about", label: "About", placeholder: "About this campaign...", multiline: true },
            ].map((field) => (
              <View key={field.key} style={styles.formField}>
                <Text style={[styles.formLabel, { color: c.text }]}>{field.label}</Text>
                <TextInput
                  style={[
                    styles.formInput,
                    {
                      backgroundColor: c.inputBg,
                      color: c.text,
                      minHeight: field.tall ? 120 : 80,
                      textAlignVertical: "top",
                    },
                  ]}
                  placeholder={field.placeholder}
                  placeholderTextColor={c.textLight}
                  value={(form as any)[field.key]}
                  onChangeText={(t) => setForm((f) => ({ ...f, [field.key]: t }))}
                  multiline
                />
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SCREEN_H_PAD,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 26 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  createBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
  /** Shared horizontal inset with header + list so usage, filters, and cards share one column. */
  usageAndFilters: {
    marginHorizontal: SCREEN_H_PAD,
    marginBottom: 10,
  },
  usageBar: {
    paddingVertical: 10,
    paddingHorizontal: CARD_INNER_PAD,
    borderRadius: 12,
    marginBottom: 10,
  },
  usageText: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  filterRowScroll: {
    alignSelf: "stretch",
  },
  filterRowContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  filterChip: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  filterChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    lineHeight: 16,
    textAlign: "center",
  },
  filterChipTextAndroid: {
    includeFontPadding: false,
  },
  list: { paddingHorizontal: SCREEN_H_PAD },
  emptyCard: {
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
  },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 15, marginTop: 12 },
  campCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    overflow: "hidden",
  },
  campImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    marginBottom: 14,
  },
  campCardTop: {
    flexDirection: "row",
    marginBottom: 12,
  },
  campTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, marginBottom: 6 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Poppins_500Medium", fontSize: 11, textTransform: "capitalize" },
  campAmounts: { flexDirection: "row", alignItems: "baseline", marginBottom: 8 },
  campRaised: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  campGoal: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressPercent: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 6 },
  campActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 14,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionChipText: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: { fontFamily: "Poppins_500Medium", fontSize: 15 },
  modalTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17 },
  modalSave: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  formContent: { padding: 20, paddingBottom: 40 },
  formField: { marginBottom: 20 },
  formLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 15, marginBottom: 2 },
  formSublabel: { fontFamily: "Poppins_400Regular", fontSize: 12, marginBottom: 10 },
  sectionDivider: { borderTopWidth: 1, marginBottom: 20, marginTop: 4 },
  formInput: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
  },
  imageModeTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  imageModeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  imageModeTabText: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  uploadArea: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    overflow: "hidden",
  },
  uploadContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    position: "relative",
  },
  uploadIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  uploadTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    marginBottom: 4,
  },
  uploadHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  uploadText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    marginTop: 8,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
  },
  uploadOverlay: {
    position: "absolute",
    bottom: 36,
    alignItems: "center",
  },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  changeBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
  urlPreview: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    marginTop: 10,
  },
  removeImageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  removeImageText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  galleryHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  galleryHintText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    flex: 1,
  },
  galleryScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  galleryItem: {
    position: "relative",
  },
  galleryThumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  galleryRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 11,
  },
  galleryAddBtn: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  galleryAddText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  galleryEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
});
