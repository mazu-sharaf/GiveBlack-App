import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Animated, Platform, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/components/AppHeader";
import Confetti from "@/components/Confetti";
import { getApiUrl } from "@/lib/query-client";
import * as Print from "expo-print";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

type Status = "loading" | "success" | "failed";

function generateReference() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "GB-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

import { buildReceiptHtml } from "@/lib/receipt-html";

export default function CheckoutResultScreen() {
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  const c = useThemeColors();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>("usd");
  const [orgName, setOrgName] = useState<string>("Organization");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [donationRef] = useState(generateReference());

  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const checkmarkOpacity = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(30)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    async function loadStatus() {
      if (!session_id) {
        setStatus("failed");
        setErrorMsg("Missing payment session. If you completed payment, it may take a moment to appear.");
        return;
      }
      try {
        const base = getApiUrl().replace(/\/$/, "");
        const res = await fetch(`${base}/api/payments/checkout-status?session_id=${encodeURIComponent(String(session_id))}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Could not verify payment status");
        }
        const data = await res.json();
        if (data.paymentStatus === "paid" && data.donation?.status === "pending") {
          try {
            await fetch(`${base}/api/payments/finalize-checkout-donation`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: String(session_id) }),
            });
          } catch {
            /* webhook or reconcile may still apply */
          }
        }
        const paid =
          data.paymentStatus === "paid" ||
          data.donation?.status === "succeeded";
        setAmount(typeof data.amountTotal === "number" ? data.amountTotal : data.donation?.amount ?? null);
        setCurrency(data.currency || "usd");
        if (data.donation?.org_id) {
          try {
            const orgRes = await fetch(`${base}/api/organizations/${data.donation.org_id}`);
            if (orgRes.ok) {
              const orgData = await orgRes.json();
              if (orgData.name) setOrgName(orgData.name);
            }
          } catch {}
        }
        setStatus(paid ? "success" : "failed");
        if (!paid) {
          setErrorMsg("Your payment was not completed. You can safely try again.");
        }
      } catch (e: any) {
        setStatus("failed");
        setErrorMsg(e?.message || "Could not verify payment status. Please check your email receipt.");
      }
    }
    loadStatus();
  }, [session_id]);

  useEffect(() => {
    if (status === "success") {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(checkmarkScale, {
            toValue: 1,
            friction: 4,
            tension: 60,
            useNativeDriver: true,
          }),
          Animated.timing(checkmarkOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(contentSlide, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [status]);

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const donorName = user?.name || user?.email || "Anonymous Donor";
  const receiptFileName = `GiveBlack-Receipt-${donationRef}.pdf`;
  const displayAmount = amount != null
    ? amount.toLocaleString(undefined, { style: "currency", currency: currency.toUpperCase() })
    : "";

  function buildReceiptPdfParams() {
    const total = amount || 0;
    const platformFee = parseFloat((total * 0.03).toFixed(2));
    const educationAmount = parseFloat((total * 0.05).toFixed(2));
    const endowmentAmount = parseFloat((total * 0.01).toFixed(2));
    const netToOrg = parseFloat((total - platformFee - educationAmount - endowmentAmount).toFixed(2));
    return new URLSearchParams({
      orgName,
      donorName,
      isAnonymous: user ? "false" : "true",
      date: dateStr,
      reference: donationRef,
      amount: String(total),
      netToOrg: String(netToOrg),
      platformFee: String(platformFee),
      educationAmount: String(educationAmount),
      endowmentAmount: String(endowmentAmount),
    });
  }

  async function createReceiptPdf(): Promise<
    | { platform: "web"; blob: Blob; fileName: string }
    | { platform: "native"; uri: string; fileName: string }
  > {
    if (Platform.OS === "web") {
      const base = getApiUrl().replace(/\/$/, "");
      const params = buildReceiptPdfParams();
      const res = await fetch(`${base}/receipt-pdf?${params}`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      return { platform: "web", blob, fileName: receiptFileName };
    }

    const html = buildReceiptHtml({
      donorName,
      orgName,
      dateStr,
      reference: donationRef,
      totalCharged: amount || 0,
      currency,
    });
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const docDir = LegacyFileSystem.documentDirectory;
    if (!docDir) throw new Error("Unable to resolve a writable document directory on this device.");
    const newUri = `${docDir}${receiptFileName}`;
    await LegacyFileSystem.moveAsync({ from: uri, to: newUri });
    return { platform: "native", uri: newUri, fileName: receiptFileName };
  }

  async function handleDownloadReceipt() {
    try {
      const pdf = await createReceiptPdf();
      if (pdf.platform === "web") {
        const url = URL.createObjectURL(pdf.blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = pdf.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert(
            "Could not open save sheet",
            "Sharing is not available on this device. Try the Share button, or take a screenshot of your receipt."
          );
          return;
        }
        await Sharing.shareAsync(pdf.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Save receipt",
          UTI: "com.adobe.pdf",
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not generate receipt";
      Alert.alert("Error", msg);
    }
  }

  async function handleShareReceipt() {
    try {
      const pdf = await createReceiptPdf();
      if (pdf.platform === "web") {
        const file = new File([pdf.blob], pdf.fileName, { type: "application/pdf" });
        if ((navigator as any).canShare?.({ files: [file] })) {
          await (navigator as any).share({ files: [file], title: "GiveBlack Donation Receipt", text: `Donation receipt ${donationRef}` });
        } else {
          const url = URL.createObjectURL(pdf.blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = pdf.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert(
            "Sharing unavailable",
            "The system share sheet could not be opened on this device."
          );
          return;
        }
        await Sharing.shareAsync(pdf.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Donation Receipt",
          UTI: "com.adobe.pdf",
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not share receipt";
      Alert.alert("Error", msg);
    }
  }

  if (status === "loading") {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Checking payment" showSearch={false} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={c.green} />
          <Text style={[styles.title, { color: c.text, marginTop: 16 }]}>Verifying your donation...</Text>
          <Text style={[styles.message, { color: c.textMuted }]}>
            This usually takes just a moment.
          </Text>
        </View>
      </View>
    );
  }

  if (status === "success") {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Confetti />
        <ScrollView contentContainerStyle={styles.receiptContainer}>
          <Animated.View
            style={[
              styles.iconCircle,
              {
                borderColor: c.green,
                transform: [{ scale: checkmarkScale }],
                opacity: checkmarkOpacity,
              },
            ]}
          >
            <Ionicons name="checkmark" size={48} color={c.green} />
          </Animated.View>

          <Animated.View
            style={{
              opacity: contentOpacity,
              transform: [{ translateY: contentSlide }],
              alignItems: "center",
              width: "100%",
            }}
          >
            <Text style={[styles.title, { color: c.text }]}>Donation Complete</Text>
            <Text style={[styles.message, { color: c.textMuted }]}>
              Thank you for your generosity
            </Text>

            <View style={[styles.receiptCard, { backgroundColor: c.cardBg }]}>
              <View style={styles.receiptHeader}>
                <View style={[styles.gbBadge, { backgroundColor: c.green }]}>
                  <Text style={styles.gbBadgeText}>GB</Text>
                </View>
                <View>
                  <Text style={[styles.receiptBrand, { color: c.text }]}>GiveBlack</Text>
                  <Text style={[styles.receiptLabel, { color: c.textMuted }]}>DONATION RECEIPT</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: c.border }]} />

              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: c.textMuted }]}>Donor</Text>
                <Text style={[styles.rowValue, { color: c.text }]}>{donorName}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: c.textMuted }]}>Organization</Text>
                <Text style={[styles.rowValue, { color: c.text }]}>{orgName}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: c.textMuted }]}>Date</Text>
                <Text style={[styles.rowValue, { color: c.text }]}>{dateStr}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: c.textMuted }]}>Reference</Text>
                <Text style={[styles.rowValue, { color: c.text }]}>{donationRef}</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: c.border }]} />

              {displayAmount ? (
                <View style={styles.row}>
                  <Text style={[styles.totalLabel, { color: c.text }]}>Total</Text>
                  <Text style={[styles.totalValue, { color: c.text }]}>{displayAmount}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.receiptActions}>
              <Pressable style={[styles.actionBtn, { backgroundColor: c.green }]} onPress={handleDownloadReceipt}>
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Download</Text>
              </Pressable>
              <Pressable style={[styles.actionBtnOutline, { borderColor: c.green }]} onPress={handleShareReceipt}>
                <Ionicons name="share-social-outline" size={18} color={c.green} />
                <Text style={[styles.actionBtnOutlineText, { color: c.green }]}>Share</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.green }]}
              onPress={() => router.back()}
            >
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title="Donation status" showSearch={false} />
      <View style={styles.centerContent}>
        <View style={[styles.iconCircle, { borderColor: "#FF4444" }]}>
          <Ionicons name="close" size={42} color="#FF4444" />
        </View>
        <Text style={[styles.title, { color: c.text }]}>Payment Failed</Text>
        <Text style={[styles.message, { color: c.textMuted }]}>
          {errorMsg || "Your payment did not go through. You can safely try again from the campaign."}
        </Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: c.green }]}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryText}>Try Again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    textAlign: "center",
  },
  message: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  receiptContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  receiptCard: {
    borderRadius: 16,
    padding: 20,
    width: "100%",
    marginTop: 24,
    marginBottom: 24,
  },
  receiptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  gbBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  gbBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#fff" },
  receiptBrand: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  receiptLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, letterSpacing: 1 },
  divider: { height: 1, marginVertical: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowLabel: { fontFamily: "Poppins_400Regular", fontSize: 14, flex: 1 },
  rowValue: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  totalLabel: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  totalValue: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  receiptActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
  actionBtnOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 2,
  },
  actionBtnOutlineText: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  primaryBtn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: "#FFFFFF",
  },
});
