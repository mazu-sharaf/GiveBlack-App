import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useFocusEffect } from "expo-router";
import AppHeader from "@/components/AppHeader";

type PayoutRow = {
  transfer_id: string;
  donation_count: number;
  amount_cents: number;
  first_paid_at: string | null;
  last_paid_at: string | null;
};

export default function PaymentHistoryPage() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { session, fetchWithAuth } = useAuth();

  const [historyLoading, setHistoryLoading] = useState(false);
  const [payoutHistory, setPayoutHistory] = useState<PayoutRow[]>([]);

  const loadPayoutHistory = useCallback(async () => {
    if (!session) return;
    setHistoryLoading(true);
    try {
      const res = await fetchWithAuth("/api/org/payouts/history", { method: "GET" });
      if (res.ok) {
        const j = (await res.json()) as { payouts?: PayoutRow[] };
        setPayoutHistory(Array.isArray(j.payouts) ? j.payouts : []);
      } else {
        setPayoutHistory([]);
      }
    } catch {
      setPayoutHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [session, fetchWithAuth]);

  useEffect(() => {
    void loadPayoutHistory();
  }, [loadPayoutHistory]);

  useFocusEffect(
    useCallback(() => {
      void loadPayoutHistory();
    }, [loadPayoutHistory])
  );

  const fmtMoney = (cents: number) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString();
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader variant="org" title="Payment history" showBack showSearch={false} showNotifications={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>PAYMENT RELEASE HISTORY</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          {historyLoading ? (
            <View style={{ paddingVertical: 6 }}>
              <ActivityIndicator size="small" color={c.textMuted} />
            </View>
          ) : payoutHistory.length === 0 ? (
            <Text style={[styles.infoSub, { color: c.textMuted }]}>
              No releases yet. When payments are released, they will show here.
            </Text>
          ) : (
            payoutHistory.map((p, idx) => {
              const border = idx === payoutHistory.length - 1 ? 0 : StyleSheet.hairlineWidth;
              return (
                <View key={p.transfer_id} style={[styles.historyRow, { borderBottomColor: c.border, borderBottomWidth: border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyTitle, { color: c.text }]}>
                      {fmtMoney(p.amount_cents)}
                      <Text style={[styles.historyMeta, { color: c.textMuted }]}> · {p.donation_count} donations</Text>
                    </Text>
                    <Text style={[styles.infoSub, { color: c.textMuted, marginTop: 4 }]}>
                      {fmtDate(p.last_paid_at)} · {p.transfer_id}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
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
  infoSub: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12 },
  historyRow: { paddingVertical: 12 },
  historyTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15 },
  historyMeta: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13 },
});

