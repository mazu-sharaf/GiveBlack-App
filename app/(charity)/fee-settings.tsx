import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

export default function FeeSettingsScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { user, session } = useAuth();
  const bottomPad = insets.bottom;

  const [absorbFees, setAbsorbFees] = useState(false);
  const [ecosystemOptIn, setEcosystemOptIn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apiBase = getApiUrl().replace(/\/$/, "");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const orgId = user?.charityId || user?.id;
      const res = await fetch(`${apiBase}/api/organizations/${orgId}/fee-settings`);
      if (res.ok) {
        const data = await res.json();
        setAbsorbFees(data.absorb_fees || false);
        setEcosystemOptIn(data.ecosystem_opt_in !== false);
      }
    } catch (e) {}
    setLoading(false);
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const orgId = user?.charityId || user?.id;
      const res = await fetch(`${apiBase}/api/organizations/${orgId}/fee-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ absorbFees, ecosystemOptIn }),
      });
      if (res.ok) {
        Alert.alert("Saved", "Your fee settings have been updated.");
      } else {
        Alert.alert("Error", "Failed to save settings.");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to save settings.");
    }
    setSaving(false);
  }

  const sampleDonation = 100;
  const platformFee = sampleDonation * 0.03;
  const ecosystemFee = ecosystemOptIn ? sampleDonation * 0.05 : 0;
  const netToOrg = absorbFees
    ? sampleDonation - platformFee - ecosystemFee
    : sampleDonation - ecosystemFee;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, justifyContent: "center", alignItems: "center" }]}>
        <Stack.Screen options={{ title: "Fee Settings" }} />
        <ActivityIndicator size="large" color={c.green} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: "Fee Settings" }} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: c.text }]}>Fee Preferences</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>
          Configure how platform fees and ecosystem contributions are handled for your organization.
        </Text>

        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="card-outline" size={22} color={c.green} />
              <View style={styles.settingText}>
                <Text style={[styles.settingLabel, { color: c.text }]}>Absorb Platform Fees</Text>
                <Text style={[styles.settingDesc, { color: c.textMuted }]}>
                  Your organization pays the 3% platform fee instead of the donor
                </Text>
              </View>
            </View>
            <Switch
              value={absorbFees}
              onValueChange={setAbsorbFees}
              trackColor={{ false: c.progressBarBg, true: c.green }}
              thumbColor={Colors.white}
            />
          </View>

          <View style={[styles.separator, { backgroundColor: c.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="school-outline" size={22} color={c.green} />
              <View style={styles.settingText}>
                <Text style={[styles.settingLabel, { color: c.text }]}>Participate in Education Ecosystem</Text>
                <Text style={[styles.settingDesc, { color: c.textMuted }]}>
                  A portion of donations supports Black education initiatives across the GiveBlack network
                </Text>
              </View>
            </View>
            <Switch
              value={ecosystemOptIn}
              onValueChange={setEcosystemOptIn}
              trackColor={{ false: c.progressBarBg, true: c.green }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        <Text style={[styles.previewTitle, { color: c.text }]}>Breakdown Preview</Text>
        <Text style={[styles.previewSubtitle, { color: c.textMuted }]}>
          For a sample $100 donation
        </Text>

        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: c.textMuted }]}>Donation Amount</Text>
            <Text style={[styles.breakdownValue, { color: c.text }]}>${sampleDonation.toFixed(2)}</Text>
          </View>
          <View style={[styles.breakdownSep, { backgroundColor: c.border }]} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: c.textMuted }]}>
              Platform Fee (3%) {absorbFees ? "(you pay)" : "(donor pays)"}
            </Text>
            <Text style={[styles.breakdownValue, { color: absorbFees ? c.danger : c.textMuted }]}>
              {absorbFees ? `-$${platformFee.toFixed(2)}` : "$0.00"}
            </Text>
          </View>
          {ecosystemOptIn && (
            <>
              <View style={[styles.breakdownSep, { backgroundColor: c.border }]} />
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: c.textMuted }]}>Education Ecosystem (5%)</Text>
                <Text style={[styles.breakdownValue, { color: c.danger }]}>-${ecosystemFee.toFixed(2)}</Text>
              </View>
            </>
          )}
          <View style={[styles.breakdownSep, { backgroundColor: c.border }]} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabelBold, { color: c.text }]}>Net to Organization</Text>
            <Text style={[styles.breakdownValueBold, { color: c.green }]}>${netToOrg.toFixed(2)}</Text>
          </View>
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: c.green }]}
          onPress={saveSettings}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save Settings</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: "rgba(0,0,0,0.08)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: 12,
    marginRight: 12,
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    marginBottom: 2,
  },
  settingDesc: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  separator: {
    height: 1,
    marginVertical: 8,
  },
  previewTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    marginBottom: 2,
  },
  previewSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  breakdownSep: {
    height: 1,
  },
  breakdownLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    flex: 1,
  },
  breakdownValue: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  breakdownLabelBold: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  breakdownValueBold: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.white,
  },
});
