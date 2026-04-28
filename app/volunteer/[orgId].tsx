import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import OrgAvatar from "@/components/OrgAvatar";
import { getApiUrl } from "@/lib/query-client";
import AppHeader from "@/components/AppHeader";

const SKILLS = [
  "Tutoring",
  "Mentoring",
  "Event Planning",
  "IT Support",
  "Marketing",
  "Other",
];

const AVAILABILITY_OPTIONS = ["Weekdays", "Weekends", "Flexible"];

export default function VolunteerSignupScreen() {
  const { orgId, campaignId } = useLocalSearchParams<{ orgId: string; campaignId?: string }>();
  const insets = useSafeInsets();
  const { organizations } = useApp();
  const { user, session } = useAuth();
  const c = useThemeColors();

  const org = organizations.find((o) => o.id === orgId);

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [availability, setAvailability] = useState("Flexible");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const bottomPad = insets.bottom;

  function toggleSkill(skill: string) {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) {
      Alert.alert("Required Fields", "Please enter your name and email.");
      return;
    }

    if (selectedSkills.length === 0) {
      Alert.alert("Select Skills", "Please select at least one skill or interest.");
      return;
    }

    setSubmitting(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/volunteers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.accessToken
            ? { Authorization: `Bearer ${session.accessToken}` }
            : {}),
        },
        body: JSON.stringify({
          userId: user?.id || null,
          orgId: orgId,
          campaignId: campaignId || null,
          orgName: org?.name || "",
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          skills: selectedSkills.join(", "),
          availability,
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        Alert.alert("Error", data.error || "Failed to submit. Please try again.");
      }
    } catch (e) {
      Alert.alert("Error", "Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Volunteer" showSearch={false} />
        <View style={styles.successContainer}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={72} color={c.green} />
          </View>
          <Text style={[styles.successTitle, { color: c.text }]}>Thank You!</Text>
          <Text style={[styles.successText, { color: c.textMuted }]}>
            Your volunteer application for {org?.name || "this organization"} has been submitted successfully.
          </Text>
          <Text style={[styles.successSubtext, { color: c.textLight }]}>
            The organization will review your application and reach out to you soon.
          </Text>
          <Pressable
            style={[styles.successBtn, { backgroundColor: c.green }]}
            onPress={() => router.back()}
          >
            <Text style={styles.successBtnText}>Back to Campaign</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="Volunteer" showSearch={false} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomPad + 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {org && (
          <View style={[styles.orgBanner, { backgroundColor: c.cardBg }]}>
            <View style={{ marginRight: 14 }}>
              <OrgAvatar imageUrl={org.imageUrl} thumbnailUrl={org.thumbnailUrl} initials={org.initials} imageColor={org.imageColor} size={48} fontSize={16} />
            </View>
            <View style={styles.orgInfo}>
              <Text style={[styles.orgName, { color: c.text }]}>{org.name}</Text>
              <Text style={[styles.orgSubtext, { color: c.textMuted }]}>Volunteer with this organization</Text>
            </View>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: c.text }]}>Your Information</Text>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Full Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            placeholderTextColor={c.textLight}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={c.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Phone (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter your phone number"
            placeholderTextColor={c.textLight}
            keyboardType="phone-pad"
          />
        </View>

        <Text style={[styles.sectionLabel, { color: c.text }]}>Skills & Interests</Text>
        <Text style={[styles.sectionSubtext, { color: c.textMuted }]}>Select all that apply</Text>

        <View style={styles.chipsContainer}>
          {SKILLS.map((skill) => {
            const selected = selectedSkills.includes(skill);
            return (
              <Pressable
                key={skill}
                style={[styles.chip, { backgroundColor: c.cardBg, borderColor: c.border }, selected && { backgroundColor: c.green, borderColor: c.green }]}
                onPress={() => toggleSkill(skill)}
              >
                {selected && (
                  <Ionicons name="checkmark" size={14} color={Colors.white} style={{ marginRight: 4 }} />
                )}
                <Text style={[styles.chipText, { color: c.text }, selected && { color: Colors.white }]}>
                  {skill}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: c.text }]}>Availability</Text>

        <View style={styles.availabilityRow}>
          {AVAILABILITY_OPTIONS.map((opt) => {
            const selected = availability === opt;
            return (
              <Pressable
                key={opt}
                style={[styles.availChip, { backgroundColor: c.cardBg, borderColor: c.border }, selected && { backgroundColor: c.green, borderColor: c.green }]}
                onPress={() => setAvailability(opt)}
              >
                <Text style={[styles.availChipText, { color: c.text }, selected && { color: Colors.white }]}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Message (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
            value={message}
            onChangeText={setMessage}
            placeholder="Tell the organization why you'd like to volunteer..."
            placeholderTextColor={c.textLight}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <Pressable
          style={[styles.submitBtn, { backgroundColor: c.green }, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.submitBtnText}>Submit Application</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  orgBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    marginBottom: 24,
  },
  orgAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  orgInitials: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
  },
  orgSubtext: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    marginTop: 2,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    marginBottom: 6,
  },
  sectionSubtext: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  chipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  availabilityRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  availChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  availChipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.white,
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  successIconWrap: {
    marginBottom: 20,
  },
  successTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 28,
    marginBottom: 12,
  },
  successText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
  },
  successSubtext: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  successBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: "center",
  },
  successBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.white,
  },
});
