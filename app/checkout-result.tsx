import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Animated, Platform, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import AppHeader from "@/components/AppHeader";
import Confetti from "@/components/Confetti";
import { getApiUrl } from "@/lib/query-client";
import * as Print from "expo-print";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { buildReceiptHtml } from "@/lib/receipt-html";
import RatingModal from "@/components/RatingModal";

type Status = "loading" | "success" | "failed";

function generateReference() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "GB-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function CheckoutResultScreen() {
  const { session_id, cancelled } = useLocalSearchParams<{ session_id?: string; cancelled?: string }>();
  const c = useThemeColors();
  const { user, session, refreshPendingDonationCount, refreshDonationSummary } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>("usd");
  const [orgName, setOrgName] = useState<string>("Organization");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [donationRef] = useState(generateReference());
  const [showRating, setShowRating] = useState(false);
  const [donationDate, setDonationDate] = useState<string | null>(null);
  const [realRef, setRealRef] = useState<string | null>(null);
  const [donationDonorName, setDonationDonorName] = useState<string | null>(null);

  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const checkmarkOpacity = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(30)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    async function loadStatus() {
      if (cancelled === "1" || cancelled === "true") {
        setStatus("failed");
        setErrorMsg("Checkout was cancelled.");
        return;
      }
      if (!session_id) {
        setStatus("failed");
        setErrorMsg("Missing payment session. If you completed payment, it may take a moment to appear.");
        return;
      }
      try {
        const base = getApiUrl().replace(/\/$/, "");
        const statusUrl = `${base}/api/payments/checkout-status?session_id=${encodeURIComponent(String(session_id))}`;

        const fetchStatus = async () => {
          const res = await fetch(statusUrl);
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Could not verify payment status");
          }
          return res.json() as Promise<{
            paymentStatus?: string;
            amountTotal?: number | null;
            currency?: string | null;
            donation?: {
              status?: string;
              amount?: number;
              currency?: string;
              org_id?: string | null;
              org_name?: string | null;
              donor_name?: string | null;
              is_anonymous?: boolean;
              paid_at?: string | null;
              created_at?: string | null;
              stripe_payment_intent_id?: string | null;
            } | null;
          }>;
        };

        let data = await fetchStatus();

        // If Checkout is paid but donation is still pending, attempt to finalize server-side
        // and poll briefly so the donation history doesn't remain stuck in "pending".
        if (data.paymentStatus === "paid" && data.donation?.status === "pending") {
          for (let i = 0; i < 10; i++) {
            try {
              await fetch(`${base}/api/payments/finalize-checkout-donation`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: String(session_id) }),
              });
            } catch {
              // ignore and re-check status; webhook may apply
            }
            await new Promise((r) => setTimeout(r, 650));
            data = await fetchStatus();
            if (data.donation?.status === "succeeded") break;
          }
        }

        const paid = data.paymentStatus === "paid" || data.donation?.status === "succeeded";
        setAmount(typeof data.amountTotal === "number" ? data.amountTotal : data.donation?.amount ?? null);
        setCurrency(data.currency || "usd");

        const don = data.donation;
        if (don) {
          // Use org_name from donation first, fall back to API lookup
          if (don.org_name) {
            setOrgName(don.org_name);
          } else if (don.org_id) {
            try {
              const orgRes = await fetch(`${base}/api/organizations/${don.org_id}`);
              if (orgRes.ok) {
                const orgData = await orgRes.json();
                if (orgData.name) setOrgName(orgData.name);
              }
            } catch {}
          }

          // Real paid date
          const rawDate = don.paid_at || don.created_at;
          if (rawDate) {
            try {
              const d = new Date(rawDate);
              if (isFinite(d.getTime())) {
                setDonationDate(d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
              }
            } catch {}
          }

          // Real reference from Stripe payment intent
          const piRef = don.stripe_payment_intent_id;
          if (piRef) {
            setRealRef(piRef.slice(-10).toUpperCase());
          }

          // Donor name from donation record
          if (don.is_anonymous) {
            setDonationDonorName("Anonymous");
          } else if (don.donor_name) {
            setDonationDonorName(don.donor_name);
          }
        } else if (data.donation?.org_id) {
          try {
            const orgRes = await fetch(`${base}/api/organizations/${data.donation.org_id}`);
            if (orgRes.ok) {
              const orgData = await orgRes.json();
              if (orgData.name) setOrgName(orgData.name);
            }
          } catch {}
        }

        if (paid) {
          setStatus("success");
        } else {
          setStatus("failed");
          setErrorMsg("Your payment was not completed. You can safely try again.");
        }
        void refreshPendingDonationCount();
      } catch (e: any) {
        setStatus("failed");
        setErrorMsg(e?.message || "Could not verify payment status. Please check your email receipt.");
        void refreshPendingDonationCount();
      }
    }
    loadStatus();
  }, [session_id, cancelled, refreshPendingDonationCount]);

  useEffect(() => {
    if (status !== "success") {
      setShowRating(false);
      return;
    }
    if (!session?.accessToken || user?.type !== "donor" || !user?.id) {
      setShowRating(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 8; i++) {
        if (cancelled) return;
        const summary = await refreshDonationSummary();
        if (cancelled) return;
        if (summary && summary.donation_count >= 1) {
          if (!cancelled) setShowRating(summary.donation_count === 1);
          return;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      if (!cancelled) setShowRating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, session?.accessToken, user?.type, user?.id, refreshDonationSummary]);

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
    // `Animated.Value` refs from `useRef` are stable; only `status` should retrigger the entrance animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const today = new Date();
  const dateStr = donationDate || today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const donorName = donationDonorName || user?.name || user?.email || "Anonymous Donor";
  const displayRef = realRef || donationRef;
  const receiptFileName = `GiveBlack-Receipt-${displayRef}.pdf`;
  const total = amount || 0;
  const platformFee = parseFloat((total * 0.03).toFixed(2));
  const educationAmount = parseFloat((total * 0.05).toFixed(2));
  const endowmentAmount = parseFloat((total * 0.01).toFixed(2));
  const netToOrg = parseFloat((total - platformFee - educationAmount - endowmentAmount).toFixed(2));
  const displayAmount = amount != null
    ? amount.toLocaleString(undefined, { style: "currency", currency: currency.toUpperCase() })
    : "";

  function buildReceiptPdfParams() {
    return new URLSearchParams({
      orgName,
      donorName,
      isAnonymous: donationDonorName === "Anonymous" ? "true" : user ? "false" : "true",
      date: dateStr,
      reference: displayRef,
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
      reference: displayRef,
      totalCharged: total,
      currency,
      orgAmount: netToOrg,
      platformFee,
      educationContribution: educationAmount,
      endowmentContribution: endowmentAmount,
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
        {showRating && user?.id ? (
          <RatingModal
            variant="first_donation"
            milestoneId={user.id}
            delayMs={3000}
            onFullyClosed={() => setShowRating(false)}
          />
        ) : null}
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
            <Text style={[styles.title, { color: c.text }]}>Payment successful</Text>
            <Text style={[styles.message, { color: c.textMuted }]}>
              Thank you for your donation.
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
                <Text style={[styles.rowValue, { color: c.text }]}>{displayRef}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: c.textMuted }]}>Status</Text>
                <Text style={[styles.rowValue, { color: c.green }]}>Confirmed</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: c.border }]} />

              {total > 0 ? (
                <>
                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: c.textMuted }]}>To organization</Text>
                    <Text style={[styles.rowValue, { color: c.text }]}>${netToOrg.toFixed(2)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: c.textMuted }]}>Platform fee (3%)</Text>
                    <Text style={[styles.rowValue, { color: c.text }]}>${platformFee.toFixed(2)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: c.textMuted }]}>Education (5%)</Text>
                    <Text style={[styles.rowValue, { color: c.text }]}>${educationAmount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: c.textMuted }]}>Endowment (1%)</Text>
                    <Text style={[styles.rowValue, { color: c.text }]}>${endowmentAmount.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: c.border }]} />
                  <View style={styles.row}>
                    <Text style={[styles.totalLabel, { color: c.text }]}>Total charged</Text>
                    <Text style={[styles.totalValue, { color: c.text }]}>{displayAmount}</Text>
                  </View>
                  <Text style={[styles.taxNote, { color: c.textMuted }]}>
                    This donation may be tax-deductible. Keep this receipt for your records.
                  </Text>
                </>
              ) : displayAmount ? (
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
              onPress={() => router.replace("/(tabs)" as any)}
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
        <View style={[styles.iconCircle, { borderColor: c.danger }]}>
          <Ionicons name="close" size={42} color={c.danger} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>Payment Failed</Text>
        <Text style={[styles.message, { color: c.textMuted }]}>
          {errorMsg || "Your payment did not go through. You can safely try again from the campaign."}
        </Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: c.green }]}
          onPress={() => router.replace("/(tabs)" as any)}
        >
          <Text style={styles.primaryText}>Go Home</Text>
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
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 24,
    textAlign: "center",
  },
  message: {
    fontFamily: "SpaceGrotesk_400Regular",
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
  gbBadgeText: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 14, color: "#fff" },
  receiptBrand: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 },
  receiptLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, letterSpacing: 1 },
  divider: { height: 1, marginVertical: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, flex: 1 },
  rowValue: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13 },
  totalLabel: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 },
  totalValue: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },
  taxNote: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 16, opacity: 0.7 },
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
  actionBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15, color: "#fff" },
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
  actionBtnOutlineText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15 },
  primaryBtn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: Colors.white,
  },
});
