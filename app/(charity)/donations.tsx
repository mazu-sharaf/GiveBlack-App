import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

export default function CharityDonationsScreen() {
  const { user } = useAuth();
  const c = useThemeColors();
  const { isDark } = useTheme();
  const [donations, setDonations] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const apiBase = getApiUrl().replace(/\/$/, "");

  const loadDonations = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${apiBase}/api/charity-donations/${encodeURIComponent(user.email)}`);
      const data = await res.json();
      setDonations(data);
    } catch (e) {
      console.log("Failed to load donations:", e);
    }
  }, [user?.email, apiBase]);

  useEffect(() => { loadDonations(); }, [loadDonations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDonations();
    setRefreshing(false);
  };

  const totalAmount = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.text }]}>Donations</Text>

      <View style={[styles.totalCard, { backgroundColor: c.green }]}>
        <Text style={styles.totalLabel}>Total Received</Text>
        <Text style={styles.totalAmount}>${totalAmount.toLocaleString()}</Text>
        <Text style={styles.totalCount}>{donations.length} donation{donations.length !== 1 ? "s" : ""}</Text>
      </View>

      <FlatList
        data={donations}
        keyExtractor={(item, i) => item.id || String(i)}
        scrollEnabled={!!donations.length}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.green} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={36} color={c.textLight} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No donations received yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: c.cardBg }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(item.donorName || "A").charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.info}>
              <Text style={[styles.donorName, { color: c.text }]}>{item.donorName || "Anonymous Donor"}</Text>
              <Text style={[styles.date, { color: c.textLight }]}>{new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</Text>
              <Text style={[styles.refText, { color: c.textMuted }]}>Ref: {item.transactionRef || "N/A"}</Text>
              {item.message ? <Text style={[styles.message, { color: c.textMuted }]}>{item.message}</Text> : null}
            </View>
            <View style={styles.amountCol}>
              <Text style={[styles.amount, { color: c.green }]}>+${Number(item.amount).toLocaleString()}</Text>
              <Text style={[styles.statusBadge, { color: c.green, backgroundColor: isDark ? "#1B2E1B" : "#D1FAE5" }]}>{item.status || "completed"}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    marginBottom: 16,
  },
  totalCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  totalLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 4,
  },
  totalAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 32,
    color: Colors.white,
  },
  totalCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  listContent: { paddingBottom: 40 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  info: { flex: 1 },
  donorName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  date: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  refText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  message: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 2,
  },
  amountCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  amount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },
  statusBadge: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    textTransform: "uppercase",
    overflow: "hidden",
  },
});
