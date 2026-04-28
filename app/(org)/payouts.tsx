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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/components/AppHeader";

export default function PayoutsPage() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { session, fetchWithAuth } = useAuth();

  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountLast4, setAccountLast4] = useState("");
  const [taxId, setTaxId] = useState("");

  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; payouts_enabled: boolean } | null>(null);
  const [manualStripeAccountId, setManualStripeAccountId] = useState("");
  const [manualStripeBusy, setManualStripeBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadOrgProfile = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchWithAuth("/api/org/profile", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (data.org) {
          setBankName(String(data.org.bank_name ?? ""));
          setAccountHolder(String(data.org.account_holder_name ?? ""));
          setRoutingNumber(String(data.org.routing_number ?? ""));
          setAccountLast4(String(data.org.account_last4 ?? ""));
          setTaxId(String(data.org.tax_id ?? ""));
          setManualStripeAccountId(String(data.org.stripe_account_id ?? ""));
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
        setStripeStatus({ connected: Boolean(j.connected), payouts_enabled: Boolean(j.payouts_enabled) });
      }
    } catch {
      setStripeStatus(null);
    }
  }, [session, fetchWithAuth]);

  useEffect(() => {
    void loadOrgProfile();
    void loadConnectStatus();
  }, [loadOrgProfile, loadConnectStatus]);

  useFocusEffect(
    useCallback(() => {
      void loadOrgProfile();
      void loadConnectStatus();
    }, [loadOrgProfile, loadConnectStatus])
  );

  const applyManualStripeAccountId = useCallback(async () => {
    if (!session || manualStripeBusy) return;
    const acct = manualStripeAccountId.trim();
    if (!acct) {
      Alert.alert("Stripe", "Enter your Stripe Connect account id (starts with acct_).");
      return;
    }
    setManualStripeBusy(true);
    try {
      const res = await fetchWithAuth("/api/org/connect/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripe_account_id: acct }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        Alert.alert("Stripe", json.error || "Could not link Stripe account.");
        return;
      }
      await loadConnectStatus();
      Alert.alert("Stripe", "Stripe account linked. We’ll update payout status automatically.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Stripe", msg);
    } finally {
      setManualStripeBusy(false);
    }
  }, [session, manualStripeBusy, manualStripeAccountId, fetchWithAuth, loadConnectStatus]);

  async function saveBankDetails() {
    if (!session || saving) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/org/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_name: bankName.trim() || null,
          account_holder_name: accountHolder.trim() || null,
          routing_number: routingNumber.trim() || null,
          account_last4: accountLast4.trim() || null,
          tax_id: taxId.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Save failed", (err as { error?: string }).error || "Could not save payout settings.");
        return;
      }
      Alert.alert("Saved", "Payout settings updated.");
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save payout settings.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader variant="org" title="Payouts & payments" showBack showSearch={false} showNotifications={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>STRIPE PAYOUTS</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <View style={[styles.row, { borderBottomColor: c.border }]}>
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
              style={[styles.smallBtn, { backgroundColor: c.green, opacity: manualStripeBusy ? 0.7 : 1 }]}
              onPress={applyManualStripeAccountId}
              disabled={manualStripeBusy || !session}
            >
              {manualStripeBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.smallBtnText}>Save</Text>}
            </Pressable>
          </View>

          <Text style={[styles.infoLabel, { color: c.textMuted, marginTop: 12 }]}>Stripe account id (mandatory)</Text>
          <Text style={[styles.infoSub, { color: c.textMuted, marginTop: 6 }]}>Mandatory for automated payouts to your organization.</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, color: c.text }]}
            value={manualStripeAccountId}
            onChangeText={setManualStripeAccountId}
            placeholder="acct_..."
            placeholderTextColor={c.textLight}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>BANK DETAILS</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, color: c.text }]}
            value={bankName}
            onChangeText={setBankName}
            placeholder="Bank name"
            placeholderTextColor={c.textLight}
          />
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, color: c.text }]}
            value={accountHolder}
            onChangeText={setAccountHolder}
            placeholder="Account holder name"
            placeholderTextColor={c.textLight}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[styles.input, styles.half, { backgroundColor: c.inputBg, color: c.text }]}
              value={routingNumber}
              onChangeText={setRoutingNumber}
              placeholder="Routing #"
              placeholderTextColor={c.textLight}
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.input, styles.half, { backgroundColor: c.inputBg, color: c.text }]}
              value={accountLast4}
              onChangeText={(t) => setAccountLast4(t.replace(/\D/g, "").slice(0, 4))}
              placeholder="Last 4"
              placeholderTextColor={c.textLight}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, color: c.text }]}
            value={taxId}
            onChangeText={setTaxId}
            placeholder="Tax ID / EIN (optional)"
            placeholderTextColor={c.textLight}
            autoCapitalize="characters"
          />

          <Pressable style={[styles.saveBtn, { backgroundColor: c.green, opacity: saving ? 0.7 : 1 }]} onPress={saveBankDetails} disabled={saving}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {saving ? <ActivityIndicator size={14} color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
              <Text style={styles.saveBtnText}>Save payout settings</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 0 },
  sectionLabel: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12, letterSpacing: 0.8, marginBottom: 10, marginLeft: 4 },
  card: { borderRadius: 16, padding: 16, marginBottom: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  infoLabel: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12 },
  infoValue: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15, marginTop: 4 },
  infoSub: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12 },
  input: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, marginTop: 10 },
  half: { flex: 1 },
  smallBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  smallBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13, color: "#fff" },
  saveBtn: { marginTop: 14, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14, color: "#fff" },
});

