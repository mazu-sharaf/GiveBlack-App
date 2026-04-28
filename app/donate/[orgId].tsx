import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Animated, Switch } from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { apiGet, apiPost, getApiUrl } from "@/lib/query-client";
import { isNativeStripeAvailable, presentNativePaymentSheet } from "@/lib/stripe-confirm";
import * as Print from "expo-print";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import AppHeader from "@/components/AppHeader";
import Confetti from "@/components/Confetti";
import RatingModal from "@/components/RatingModal";

import { buildReceiptHtml } from "@/lib/receipt-html";
import { saveDonationIntent, clearDonationIntent } from "@/lib/donation-intent";

const PRESET_AMOUNTS = [5, 10, 25, 50, 100, 200];
const PLATFORM_FEE_RATE = 0.03;
const DEFAULT_EDUCATION_RATE = 0.05;
const DEFAULT_ENDOWMENT_RATE = 0.01;

type Step = "amount" | "fees" | "processing" | "success" | "error";

function generateReference() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "GB-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function DonateScreen() {
  const { orgId, campaignId: campaignIdParam, partner: partnerParam, amount: amountParam } = useLocalSearchParams<{
    orgId: string;
    campaignId?: string | string[];
    partner?: string | string[];
    amount?: string | string[];
  }>();
  const suggestedAmount = (() => {
    const raw = Array.isArray(amountParam) ? amountParam[0] : amountParam;
    if (!raw) return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const campaignId = Array.isArray(campaignIdParam) ? campaignIdParam[0] : campaignIdParam;
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { organizations, refresh } = useApp();
  const { user, isAuthenticated, isGuest, session, refreshDonationSummary } = useAuth();
  const [showFirstDonationRating, setShowFirstDonationRating] = useState(false);
  const org = organizations.find((o) => o.id === orgId);

  // Start at $0 with no preset selected.
  const [amount, setAmount] = useState<string>("0");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  // Pre-fill amount from URL param (e.g. after returning from sign-up/login).
  useEffect(() => {
    if (!suggestedAmount) return;
    if (PRESET_AMOUNTS.includes(suggestedAmount)) {
      setSelectedPreset(suggestedAmount);
      setAmount(suggestedAmount.toString());
      setCustomAmount("");
    } else {
      setSelectedPreset(null);
      setAmount(suggestedAmount.toString());
      setCustomAmount(suggestedAmount.toString());
    }
  }, [suggestedAmount]);

  // The user has reached the donate screen: clear any persisted intent so it
  // isn't applied again if they later navigate through auth for an unrelated reason.
  useEffect(() => {
    clearDonationIntent();
  }, []);

  const [step, setStep] = useState<Step>("amount");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"native" | null>(null);

  const [guestMode, setGuestMode] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestEmailInput, setGuestEmailInput] = useState("");
  const [showGuestEmailForm, setShowGuestEmailForm] = useState(false);

  // Looped guide animation shown while Stripe is processing the donation.
  const [processingGuideStep, setProcessingGuideStep] = useState<0 | 1 | 2>(0);
  const processingPulse = useRef(new Animated.Value(0)).current;

  // Looped guide animation shown on the amount screen to explain the flow.
  const [amountGuideStep, setAmountGuideStep] = useState<0 | 1 | 2>(0);
  const amountGuidePulse = useRef(new Animated.Value(0)).current;

  const [educationEnabled, setEducationEnabled] = useState(true);
  const [educationRate, setEducationRate] = useState(DEFAULT_EDUCATION_RATE);
  const [endowmentEnabled, setEndowmentEnabled] = useState(true);
  const [endowmentRate, setEndowmentRate] = useState(DEFAULT_ENDOWMENT_RATE);

  const [donationRef, setDonationRef] = useState("");

  const [resolvedPartner, setResolvedPartner] = useState<{ id: string; code: string; name: string } | null>(null);
  const [partnerLookupError, setPartnerLookupError] = useState<string | null>(null);

  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const checkmarkOpacity = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(30)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const numericAmount = Number(amount) || 0;
  const platformFee = Math.round(numericAmount * PLATFORM_FEE_RATE * 100) / 100;
  const educationContribution = educationEnabled ? Math.round(numericAmount * educationRate * 100) / 100 : 0;
  const endowmentContribution = endowmentEnabled ? Math.round(numericAmount * endowmentRate * 100) / 100 : 0;
  const orgAmount = Math.round((numericAmount - platformFee - educationContribution - endowmentContribution) * 100) / 100;
  const totalCharged = numericAmount;

  useEffect(() => {
    if (step === "success") {
      setDonationRef(generateReference());
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
  }, [step]);

  useEffect(() => {
    if (step !== "success") {
      setShowFirstDonationRating(false);
      return;
    }
    if (guestMode || !session?.accessToken || user?.type !== "donor" || !user?.id) {
      setShowFirstDonationRating(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 8; i++) {
        if (cancelled) return;
        const summary = await refreshDonationSummary();
        if (cancelled) return;
        if (summary && summary.donation_count >= 1) {
          if (!cancelled) setShowFirstDonationRating(summary.donation_count === 1);
          return;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      if (!cancelled) setShowFirstDonationRating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, guestMode, session?.accessToken, user?.type, user?.id, refreshDonationSummary]);

  useEffect(() => {
    if (step !== "processing") return;

    setProcessingGuideStep(0);
    const id = setInterval(() => {
      setProcessingGuideStep((s) => ((s + 1) % 3) as 0 | 1 | 2);
    }, 2000);

    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step !== "processing") return;
    processingPulse.setValue(0);
    Animated.timing(processingPulse, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [processingGuideStep, step, processingPulse]);

  useEffect(() => {
    if (step !== "amount") return;

    setAmountGuideStep(0);
    const id = setInterval(() => {
      setAmountGuideStep((s) => ((s + 1) % 3) as 0 | 1 | 2);
    }, 2000);

    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step !== "amount") return;

    amountGuidePulse.setValue(0);
    Animated.timing(amountGuidePulse, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [amountGuideStep, step, amountGuidePulse]);

  useEffect(() => {
    let cancelled = false;
    const raw = Array.isArray(partnerParam) ? partnerParam[0] : partnerParam;
    if (!raw || !String(raw).trim()) {
      setResolvedPartner(null);
      setPartnerLookupError(null);
      return;
    }
    (async () => {
      try {
        const data = await apiGet<{ id: string; code: string; name: string }>(
          `/api/education-partners/lookup?code=${encodeURIComponent(String(raw).trim())}`
        );
        if (!cancelled) {
          setResolvedPartner(data);
          setPartnerLookupError(null);
        }
      } catch {
        if (!cancelled) {
          setResolvedPartner(null);
          setPartnerLookupError("This partner link is not recognized.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerParam]);

  if (!org) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Donate" showSearch={false} />
        <View style={styles.centerContent}>
          <Text style={{ color: c.textMuted }}>Campaign not found</Text>
        </View>
      </View>
    );
  }

  if ((!isAuthenticated || isGuest || !session?.accessToken) && !guestMode) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Donate" showSearch={false} />
        <View style={styles.authGateWrap}>
          <View style={[styles.authGateCard, { backgroundColor: c.cardBg }]}>
            {!showGuestEmailForm ? (
              <>
                <Text style={[styles.authGateHeading, { color: c.text }]}>
                  Create a free account to donate
                </Text>
                <Text style={[styles.authGateBody, { color: c.textMuted }]}>
                  {suggestedAmount
                    ? `Give $${suggestedAmount.toFixed(2)} to `
                    : "You're one step away from supporting "}
                  <Text style={{ color: c.text, fontFamily: "SpaceGrotesk_600SemiBold" }}>{org.name}</Text>
                  {suggestedAmount
                    ? ". Create a free account to complete your donation."
                    : ". It's free and takes 30 seconds."}
                </Text>

                <Pressable
                  style={[styles.authGatePrimaryBtn, { backgroundColor: c.green }]}
                  onPress={async () => {
                    const qp = new URLSearchParams();
                    if (campaignId) qp.set("campaignId", campaignId);
                    if (suggestedAmount) qp.set("amount", String(suggestedAmount));
                    const rawPartner = Array.isArray(partnerParam) ? partnerParam[0] : partnerParam;
                    if (rawPartner) qp.set("partner", rawPartner);
                    const qs = qp.toString();
                    const returnTo = `/donate/${orgId}${qs ? `?${qs}` : ""}`;
                    await saveDonationIntent({ orgId, campaignId, amount: suggestedAmount ?? undefined });
                    router.push({ pathname: "/(auth)/donor-signup", params: { returnTo } });
                  }}
                >
                  <Text style={styles.authGatePrimaryBtnText}>Create Free Account</Text>
                </Pressable>

                <Pressable
                  style={[styles.authGateSecondaryBtn, { borderColor: c.border }]}
                  onPress={async () => {
                    const qp = new URLSearchParams();
                    if (campaignId) qp.set("campaignId", campaignId);
                    if (suggestedAmount) qp.set("amount", String(suggestedAmount));
                    const rawPartner = Array.isArray(partnerParam) ? partnerParam[0] : partnerParam;
                    if (rawPartner) qp.set("partner", rawPartner);
                    const qs = qp.toString();
                    const returnTo = `/donate/${orgId}${qs ? `?${qs}` : ""}`;
                    await saveDonationIntent({ orgId, campaignId, amount: suggestedAmount ?? undefined });
                    router.push({ pathname: "/(auth)/donor-login", params: { returnTo } });
                  }}
                >
                  <Text style={[styles.authGateSecondaryBtnText, { color: c.text }]}>Sign In</Text>
                </Pressable>

                <Pressable
                  style={styles.authGateGuestBtn}
                  onPress={() => setShowGuestEmailForm(true)}
                >
                  <Text style={[styles.authGateGuestBtnText, { color: c.textMuted }]}>Continue as guest</Text>
                </Pressable>

                <Pressable style={styles.authGateBackLink} onPress={() => router.back()}>
                  <Ionicons name="arrow-back-outline" size={14} color={c.textMuted} />
                  <Text style={[styles.authGateBackText, { color: c.textMuted }]}>Browse campaigns</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.authGateHeading, { color: c.text }]}>
                  Continue as guest
                </Text>
                <Text style={[styles.authGateBody, { color: c.textMuted }]}>
                  Enter your email to receive a donation receipt after payment.
                </Text>
                <TextInput
                  value={guestEmailInput}
                  onChangeText={setGuestEmailInput}
                  placeholder="your@email.com"
                  placeholderTextColor={c.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={{
                    borderWidth: 1.5,
                    borderColor: c.border,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    fontFamily: "SpaceGrotesk_400Regular",
                    fontSize: 15,
                    color: c.text,
                    backgroundColor: c.background,
                    width: "100%",
                  }}
                />
                <Pressable
                  style={[styles.authGatePrimaryBtn, { backgroundColor: c.green }]}
                  onPress={() => {
                    const email = guestEmailInput.trim().toLowerCase();
                    if (!email || !email.includes("@") || !email.includes(".")) {
                      Alert.alert("Invalid email", "Please enter a valid email address.");
                      return;
                    }
                    setGuestEmail(email);
                    setGuestMode(true);
                  }}
                >
                  <Text style={styles.authGatePrimaryBtnText}>Proceed to Donate</Text>
                </Pressable>
                <Pressable
                  style={{ paddingVertical: 8 }}
                  onPress={() => setShowGuestEmailForm(false)}
                >
                  <Text style={[{ color: c.textMuted, fontFamily: "SpaceGrotesk_400Regular", fontSize: 13 }]}>
                    ← Back to sign-in options
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <Pressable
            style={styles.authGateCharityRow}
            onPress={() => router.push("/(auth)/charity-login")}
          >
            <Text style={[styles.authGateCharityText, { color: c.textMuted }]}>Are you a charity? </Text>
            <Text style={[styles.authGateCharityLink, { color: c.green }]}>Sign in here</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function selectPreset(value: number) {
    setSelectedPreset(value);
    setAmount(value.toString());
    setCustomAmount("");
  }

  function handleCustomAmount(text: string) {
    setCustomAmount(text);
    setSelectedPreset(null);
    setAmount(text);
  }

  async function attemptNativePayment(token: string, value: number): Promise<"success" | "canceled" | "error"> {
    try {
      const intentRes = await apiPost<{
        clientSecret: string;
        paymentIntentId: string;
        customerId: string;
        ephemeralKey: string;
      }>(
        "/api/payments/create-intent",
        {
          orgId: org!.id,
          amount: value,
          reinvestOptIn: educationEnabled,
          reinvestPct: Math.round(educationRate * 1000) / 10,
          ...(resolvedPartner ? { educationPartnerCode: resolvedPartner.code } : {}),
          ...(campaignId ? { campaignId } : {}),
        },
        token
      );

      const result = await presentNativePaymentSheet({
        clientSecret: intentRes.clientSecret,
        customerId: intentRes.customerId,
        ephemeralKey: intentRes.ephemeralKey,
        merchantName: "GiveBlack",
        allowsDelayedPaymentMethods: false,
      });
      if (result.status === "success") {
        // Finalize raised/donor totals on the server even when Stripe webhooks are not delivered (e.g. local dev or test mode without forwarding).
        try {
          await apiPost<{ ok: boolean }>(
            "/api/payments/sync-native-donation",
            { paymentIntentId: intentRes.paymentIntentId },
            token
          );
        } catch {
          // Webhook may still apply the same update; do not block the success UI.
        }
        return "success";
      }
      if (result.status === "canceled") return "canceled";
      if (result.status === "unavailable") {
        setErrorMsg("Native Stripe payment is unavailable on this build. Please use an EAS development build or production build with Stripe enabled.");
      } else {
        setErrorMsg(result.message || "Payment failed. Please try again.");
      }
      return "error";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      return "error";
    }
  }

  async function attemptGuestWebCheckout(value: number): Promise<"redirecting" | "error"> {
    try {
      const res = await apiPost<{ url: string; sessionId: string }>(
        "/api/payments/guest-donate-checkout",
        {
          orgId: org!.id,
          amount: value,
          email: guestEmail,
          reinvestOptIn: educationEnabled,
          reinvestPct: Math.round(educationRate * 1000) / 10,
          ...(resolvedPartner ? { educationPartnerCode: resolvedPartner.code } : {}),
          ...(campaignId ? { campaignId } : {}),
        }
      );
      if (res.url) {
        if (typeof window !== "undefined") {
          window.location.href = res.url;
        }
        return "redirecting";
      }
      setErrorMsg("Failed to create checkout session. Please try again.");
      return "error";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      return "error";
    }
  }

  async function attemptGuestNativePayment(value: number): Promise<"success" | "canceled" | "error"> {
    try {
      const intentRes = await apiPost<{
        clientSecret: string;
        paymentIntentId: string;
        customerId: string;
        ephemeralKey: string;
      }>(
        "/api/payments/guest-create-intent",
        {
          orgId: org!.id,
          amount: value,
          email: guestEmail,
          reinvestOptIn: educationEnabled,
          reinvestPct: Math.round(educationRate * 1000) / 10,
          ...(resolvedPartner ? { educationPartnerCode: resolvedPartner.code } : {}),
          ...(campaignId ? { campaignId } : {}),
        }
      );

      const result = await presentNativePaymentSheet({
        clientSecret: intentRes.clientSecret,
        customerId: intentRes.customerId,
        ephemeralKey: intentRes.ephemeralKey,
        merchantName: "GiveBlack",
        allowsDelayedPaymentMethods: false,
      });

      if (result.status === "success") {
        try {
          await apiPost<{ ok: boolean }>(
            "/api/payments/guest-sync-native-donation",
            { paymentIntentId: intentRes.paymentIntentId, email: guestEmail }
          );
        } catch {
          // non-fatal: webhook may still apply the update
        }
        return "success";
      }
      if (result.status === "canceled") return "canceled";
      if (result.status === "unavailable") {
        setErrorMsg("Native Stripe payment is unavailable on this build. Please use an EAS development build or production build with Stripe enabled.");
      } else {
        setErrorMsg(result.message || "Payment failed. Please try again.");
      }
      return "error";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      return "error";
    }
  }

  async function handleDonate() {
    const value = Number(amount);
    if (!value || value <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid donation amount.");
      return;
    }
    if (value < 1) {
      Alert.alert("Minimum donation", "Minimum donation amount is $1.");
      return;
    }

    setLoading(true);
    setStep("processing");
    setErrorMsg("");

    if (Platform.OS === "web") {
      if (guestMode) {
        const webResult = await attemptGuestWebCheckout(value);
        if (webResult === "error") {
          setStep("error");
          setLoading(false);
        }
        return;
      }
      setErrorMsg("Native Stripe checkout is only available in iOS/Android builds with Stripe native module enabled.");
      setStep("error");
      setLoading(false);
      return;
    }

    const nativeAvailable = await isNativeStripeAvailable();
    if (!nativeAvailable) {
      setErrorMsg("Native Stripe checkout is only available in iOS/Android builds with Stripe native module enabled.");
      setStep("error");
      setLoading(false);
      return;
    }
    setPaymentMethod("native");

    if (guestMode) {
      const guestResult = await attemptGuestNativePayment(value);
      if (guestResult === "success") {
        setStep("success");
        void refresh();
      } else if (guestResult === "canceled") {
        setStep("amount");
      } else {
        setStep("error");
      }
      setLoading(false);
      return;
    }

    const token = session!.accessToken;
    const nativeResult = await attemptNativePayment(token, value);
    if (nativeResult === "success") {
      setStep("success");
      void refreshDonationSummary();
      void refresh();
    } else if (nativeResult === "canceled") {
      setStep("amount");
    } else {
      setStep("error");
    }
    setLoading(false);
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const donorName = isAnonymous ? "Anonymous" : (guestMode ? (guestEmail || "Guest") : (user?.fullName || user?.email || "Donor"));
  const receiptDonorName = isAnonymous ? "Anonymous Donor" : donorName;
  const receiptFileName = `GiveBlack-Receipt-${donationRef}.pdf`;

  function buildReceiptPdfParams() {
    return new URLSearchParams({
      orgName: org!.name,
      donorName: receiptDonorName,
      isAnonymous: String(isAnonymous),
      date: dateStr,
      reference: donationRef,
      amount: String(totalCharged),
      netToOrg: String(orgAmount),
      platformFee: String(platformFee),
      educationAmount: String(educationContribution),
      endowmentAmount: String(endowmentContribution),
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
      donorName: receiptDonorName,
      orgName: org!.name,
      dateStr,
      reference: donationRef,
      orgAmount,
      platformFee,
      educationContribution,
      endowmentContribution,
      totalCharged,
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
        // iOS/Android: there is no public "Downloads" folder apps can write to. Open the system
        // sheet so the user can Save to Files, AirDrop, Mail, etc., same as a real "export".
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
          await (navigator as any).share({
            files: [file],
            title: "GiveBlack Donation Receipt",
            text: `Donation receipt ${donationRef}`,
          });
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

  if (step === "success") {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Confetti />
        {showFirstDonationRating && user?.id ? (
          <RatingModal
            variant="first_donation"
            milestoneId={user.id}
            delayMs={2500}
            onFullyClosed={() => setShowFirstDonationRating(false)}
          />
        ) : null}
        <ScrollView contentContainerStyle={styles.receiptContainer}>
          <Animated.View
            style={[
              styles.checkCircle,
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
            <Text style={[styles.receiptTitle, { color: c.text }]}>Donation Complete</Text>
            <Text style={[styles.receiptSubtitle, { color: c.textMuted }]}>
              {guestMode
                ? `Thank you! A receipt is being sent to ${guestEmail}`
                : "Thank you for your generosity"}
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

              <View style={[styles.receiptDivider, { backgroundColor: c.border }]} />

              <View style={styles.receiptRow}>
                <Text style={[styles.receiptRowLabel, { color: c.textMuted }]}>Donor</Text>
                <Text style={[styles.receiptRowValue, { color: c.text }]}>{donorName}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptRowLabel, { color: c.textMuted }]}>Organization</Text>
                <Text style={[styles.receiptRowValue, { color: c.text }]}>{org!.name}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptRowLabel, { color: c.textMuted }]}>Date</Text>
                <Text style={[styles.receiptRowValue, { color: c.text }]}>{dateStr}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptRowLabel, { color: c.textMuted }]}>Reference</Text>
                <Text style={[styles.receiptRowValue, { color: c.text }]}>{donationRef}</Text>
              </View>

              <View style={[styles.receiptDivider, { backgroundColor: c.border }]} />

              <View style={styles.receiptRow}>
                <Text style={[styles.receiptRowLabel, { color: c.textMuted }]}>Amount to {org!.name}</Text>
                <Text style={[styles.receiptRowValue, { color: c.green }]}>${orgAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptRowLabel, { color: c.textMuted }]}>Platform Fee (3%)</Text>
                <Text style={[styles.receiptRowValue, { color: c.text }]}>${platformFee.toFixed(2)}</Text>
              </View>
              {educationContribution > 0 && (
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptRowLabel, { color: c.textMuted }]}>Education Reinvestment</Text>
                  <Text style={[styles.receiptRowValue, { color: c.text }]}>${educationContribution.toFixed(2)}</Text>
                </View>
              )}
              {endowmentContribution > 0 && (
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptRowLabel, { color: c.textMuted }]}>Education Endowment</Text>
                  <Text style={[styles.receiptRowValue, { color: c.text }]}>${endowmentContribution.toFixed(2)}</Text>
                </View>
              )}

              <View style={[styles.receiptDivider, { backgroundColor: c.border }]} />

              <View style={styles.receiptRow}>
                <Text style={[styles.receiptTotalLabel, { color: c.text }]}>Total Charged</Text>
                <Text style={[styles.receiptTotalValue, { color: c.text }]}>${totalCharged.toFixed(2)}</Text>
              </View>
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

            {guestMode && (
              <View style={{ width: "100%", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <Text style={[styles.receiptSubtitle, { color: c.textMuted, fontSize: 13, marginBottom: 0 }]}>
                  Create a free account to track your donations and access donor features.
                </Text>
                <Pressable
                  style={[styles.authGateSecondaryBtn, { borderColor: c.green, width: "100%" }]}
                  onPress={() => {
                    const qp = new URLSearchParams();
                    if (campaignId) qp.set("campaignId", campaignId);
                    const qs = qp.toString();
                    const returnTo = `/donate/${orgId}${qs ? `?${qs}` : ""}`;
                    router.push({ pathname: "/(auth)/donor-signup", params: { returnTo } });
                  }}
                >
                  <Text style={[styles.authGateSecondaryBtnText, { color: c.green }]}>Create Free Account</Text>
                </Pressable>
              </View>
            )}

            <Pressable
              style={[styles.doneBtn, { backgroundColor: c.green }]}
              onPress={() => router.back()}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  if (step === "error") {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Donate" showSearch={false} />
        <View style={[styles.centerContent, { paddingTop: 40 }]}>
          <View style={[styles.checkCircle, { borderColor: c.danger }]}>
            <Ionicons name="close" size={48} color={c.danger} />
          </View>
          <Text style={[styles.receiptTitle, { color: c.text }]}>Payment Failed</Text>
          <Text style={[styles.receiptSubtitle, { color: c.textMuted }]}>{errorMsg}</Text>
          <Pressable style={[styles.doneBtn, { backgroundColor: c.green }]} onPress={() => { setErrorMsg(""); setStep("amount"); }}>
            <Text style={styles.doneBtnText}>Try Again</Text>
          </Pressable>
          <Pressable style={{ marginTop: 12 }} onPress={() => router.back()}>
            <Text style={{ color: c.textMuted, fontFamily: "SpaceGrotesk_500Medium" }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "processing") {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Donate" showSearch={false} />

        <View style={styles.processingMain}>
          <View style={styles.processingCenter}>
            <ActivityIndicator size="large" color={c.green} />
            <Text style={[styles.receiptTitle, { color: c.text, marginTop: 16 }]}>Processing Payment...</Text>
            <Text style={[styles.receiptSubtitle, { color: c.textMuted }]}>
              {Platform.OS === "web" && guestMode ? "Redirecting to Stripe Checkout..." : paymentMethod === "native" ? "Opening secure Stripe payment sheet..." : "Please wait while we process your donation."}
            </Text>
          </View>

          <View style={[styles.processingGuide, { paddingBottom: insets.bottom > 0 ? insets.bottom + 16 : 16 }]}>
            <View style={styles.processingGuideRow}>
              {[
                { icon: "checkmark-circle-outline", label: "Payment confirmed" },
                { icon: "arrow-forward-circle-outline", label: "Sent to org" },
                { icon: "document-text-outline", label: "Receipt ready" },
              ].map((stage, idx) => {
                const isActive = processingGuideStep === idx;
                const stageScale = isActive
                  ? processingPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
                  : 1;
                return (
                  <View key={stage.label} style={styles.processingStage}>
                    <Animated.View
                      style={[
                        styles.processingStageIcon,
                        {
                          opacity: isActive ? 1 : 0.4,
                          transform: [{ scale: stageScale as any }],
                          borderColor: isActive ? c.green : c.border,
                        },
                      ]}
                    >
                      <Ionicons name={stage.icon as any} size={18} color={isActive ? c.green : c.textMuted} />
                    </Animated.View>
                    <Text style={[styles.processingStageLabel, { color: isActive ? c.text : c.textMuted }]} numberOfLines={1}>
                      {stage.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={[styles.processingGuideLine, { backgroundColor: c.border }]} />
            <View
              style={[
                styles.processingGuideLineFill,
                {
                  backgroundColor: c.green,
                  width: `${((processingGuideStep + 1) / 3) * 100}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>
    );
  }

  if (step === "fees") {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.container, { backgroundColor: c.background }]}>
          <AppHeader showBack title="Donate" showSearch={false} />
          <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
            {partnerLookupError ? (
              <View style={[styles.partnerBanner, { backgroundColor: c.cardBg, borderColor: "#c44" }]}>
                <Ionicons name="alert-circle-outline" size={18} color="#c44" />
                <Text style={{ color: c.text, fontSize: 13, marginLeft: 8, flex: 1 }}>{partnerLookupError}</Text>
              </View>
            ) : null}
            {resolvedPartner && !partnerLookupError ? (
              <View style={[styles.partnerBanner, { backgroundColor: c.cardBg, borderColor: c.green }]}>
                <Ionicons name="school-outline" size={18} color={c.green} />
                <Text style={{ color: c.text, fontSize: 13, marginLeft: 8, flex: 1 }}>
                  Reinvest attribution:{" "}
                  <Text style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}>{resolvedPartner.name}</Text>
                </Text>
              </View>
            ) : null}
            <View style={[styles.card, { backgroundColor: c.cardBg }]}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Fee Breakdown</Text>

              <View style={styles.feeRow}>
                <Text style={[styles.feeLabel, { color: c.textMuted }]}>Platform Fee (3%)</Text>
                <Text style={[styles.feeValue, { color: c.text }]}>${platformFee.toFixed(2)}</Text>
              </View>

              <View style={[styles.feeDivider, { backgroundColor: c.border }]} />

              <View style={styles.feeToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.feeLabel, { color: c.text }]}>Reinvest in Black Education</Text>
                  <Text style={[styles.feePercent, { color: c.green }]}>{Math.round(educationRate * 100)}%</Text>
                </View>
                <Switch
                  value={educationEnabled}
                  onValueChange={setEducationEnabled}
                  trackColor={{ false: c.border, true: c.green }}
                  thumbColor="#fff"
                />
              </View>

              {educationEnabled && (
                <View style={styles.sliderRow}>
                  <Text style={[styles.sliderLabel, { color: c.textMuted }]}>0%</Text>
                  <View style={styles.dotSlider}>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                      <Pressable
                        key={val}
                        onPress={() => setEducationRate(val / 100)}
                        style={[
                          styles.sliderDot,
                          {
                            backgroundColor: val / 100 <= educationRate ? c.green : c.sliderInactive,
                            width: val / 100 === educationRate ? 16 : 10,
                            height: val / 100 === educationRate ? 16 : 10,
                            borderRadius: val / 100 === educationRate ? 8 : 5,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.sliderLabel, { color: c.textMuted }]}>10%</Text>
                </View>
              )}

              <View style={styles.feeRow}>
                <Text style={[styles.feeLabel, { color: c.textMuted }]}>Education Contribution</Text>
                <Text style={[styles.feeValue, { color: c.text }]}>${educationContribution.toFixed(2)}</Text>
              </View>

              <View style={[styles.feeDivider, { backgroundColor: c.border }]} />

              <View style={styles.feeToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.feeLabel, { color: c.text }]}>Education Endowment</Text>
                  <Text style={[styles.feePercent, { color: c.green }]}>{Math.round(endowmentRate * 100)}%</Text>
                </View>
                <Switch
                  value={endowmentEnabled}
                  onValueChange={setEndowmentEnabled}
                  trackColor={{ false: c.border, true: c.green }}
                  thumbColor="#fff"
                />
              </View>

              {endowmentEnabled && (
                <View style={styles.sliderRow}>
                  <Text style={[styles.sliderLabel, { color: c.textMuted }]}>0%</Text>
                  <View style={styles.dotSlider}>
                    {[0, 1, 2].map((val) => (
                      <Pressable
                        key={val}
                        onPress={() => setEndowmentRate(val / 100)}
                        style={[
                          styles.sliderDot,
                          {
                            backgroundColor: val / 100 <= endowmentRate ? c.green : c.sliderInactive,
                            width: val / 100 === endowmentRate ? 16 : 10,
                            height: val / 100 === endowmentRate ? 16 : 10,
                            borderRadius: val / 100 === endowmentRate ? 8 : 5,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.sliderLabel, { color: c.textMuted }]}>2%</Text>
                </View>
              )}

              <View style={styles.feeRow}>
                <Text style={[styles.feeLabel, { color: c.textMuted }]}>Endowment Contribution</Text>
                <Text style={[styles.feeValue, { color: c.text }]}>${endowmentContribution.toFixed(2)}</Text>
              </View>

              <View style={[styles.feeDivider, { backgroundColor: c.border }]} />

              <View style={styles.feeRow}>
                <Text style={[styles.feeLabel, { color: c.green }]}>Amount to {org.name}</Text>
                <Text style={[styles.feeValue, { color: c.green }]}>${orgAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={[styles.totalLabel, { color: c.text }]}>Total</Text>
                <Text style={[styles.totalValue, { color: c.text }]}>${totalCharged.toFixed(2)}</Text>
              </View>
            </View>

            <Pressable
              style={[styles.donateBtn, { backgroundColor: c.green, opacity: loading ? 0.7 : 1 }]}
              onPress={handleDonate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.donateBtnText}>Pay ${totalCharged.toFixed(2)}</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title="Donate" showSearch={false} />

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }} keyboardDismissMode="interactive">
          {partnerLookupError ? (
            <View style={[styles.partnerBanner, { backgroundColor: c.cardBg, borderColor: "#c44" }]}>
              <Ionicons name="alert-circle-outline" size={18} color="#c44" />
              <Text style={{ color: c.text, fontSize: 13, marginLeft: 8, flex: 1 }}>{partnerLookupError}</Text>
            </View>
          ) : null}
          {resolvedPartner && !partnerLookupError ? (
            <View style={[styles.partnerBanner, { backgroundColor: c.cardBg, borderColor: c.green }]}>
              <Ionicons name="school-outline" size={18} color={c.green} />
              <Text style={{ color: c.text, fontSize: 13, marginLeft: 8, flex: 1 }}>
                Reinvest attribution:{" "}
                <Text style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}>{resolvedPartner.name}</Text>
              </Text>
            </View>
          ) : null}
          <Text style={[styles.sectionTitle, { color: c.text }]}>Enter the Amount</Text>

          <View style={[styles.amountDisplay, { borderColor: c.green, backgroundColor: c.cardBg }]}>
            <View style={styles.amountInputRow}>
              <Text style={[styles.dollarPrefix, { color: c.green }]}>$</Text>
              <TextInput
                style={[styles.amountInput, { color: c.green }]}
                value={amount}
                onFocus={() => {
                  if (amount === "0") {
                    setAmount("");
                    setCustomAmount("");
                    setSelectedPreset(null);
                  }
                }}
                onChangeText={(t) => {
                  const cleaned = t.replace(/[^0-9.]/g, "");
                  const parts = cleaned.split(".", 2);
                  const normalized = parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts[0];
                  handleCustomAmount(normalized);
                }}
                keyboardType="decimal-pad"
                placeholder=""
                placeholderTextColor={c.textMuted}
                textAlign="center"
              />
            </View>
          </View>

          <View style={styles.presetGrid}>
            {PRESET_AMOUNTS.map((preset) => (
              <Pressable
                key={preset}
                style={[
                  styles.presetBtn,
                  { borderColor: c.border, backgroundColor: c.inputBg },
                  selectedPreset === preset && { borderColor: c.green, backgroundColor: c.green }
                ]}
                onPress={() => selectPreset(preset)}
              >
                <Text style={[styles.presetText, { color: c.text }, selectedPreset === preset && { color: "#fff", fontFamily: "SpaceGrotesk_600SemiBold" }]}>
                  ${preset}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.anonymousRow]}
            onPress={() => setIsAnonymous(!isAnonymous)}
          >
            <View style={[styles.checkbox, { borderColor: c.border }, isAnonymous && { backgroundColor: c.green, borderColor: c.green }]}>
              {isAnonymous && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.anonymousText, { color: c.text }]}>Donate as anonymous</Text>
          </Pressable>

          <Pressable
            style={[styles.donateBtn, { backgroundColor: c.green, opacity: loading || !numericAmount ? 0.7 : 1 }]}
            onPress={() => setStep("fees")}
            disabled={!numericAmount}
          >
            <Text style={styles.donateBtnText}>Continue</Text>
          </Pressable>

          <View style={[styles.guideCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <Text style={[styles.guideTitle, { color: c.text }]}>GiveBlack details</Text>

            <View style={styles.amountGuideRow}>
              {[
                { icon: "checkmark-circle-outline", label: "Payment confirmed" },
                { icon: "arrow-forward-circle-outline", label: "Sent to org" },
                { icon: "document-text-outline", label: "Receipt ready" },
              ].map((stage, idx) => {
                const isActive = amountGuideStep === idx;
                const stageScale = isActive
                  ? amountGuidePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
                  : 1;
                return (
                  <View key={stage.label} style={styles.amountGuideStage}>
                    <Animated.View
                      style={[
                        styles.amountGuideIcon,
                        {
                          opacity: isActive ? 1 : 0.35,
                          borderColor: isActive ? c.green : c.border,
                          transform: [{ scale: stageScale as any }],
                        },
                      ]}
                    >
                      <Ionicons name={stage.icon as any} size={18} color={isActive ? c.green : c.textMuted} />
                    </Animated.View>
                    <Text style={[styles.amountGuideLabel, { color: isActive ? c.text : c.textMuted }]} numberOfLines={1}>
                      {stage.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={[styles.amountGuideDetailTitle, { color: c.text }]}>
              {amountGuideStep === 0
                ? "What happens next"
                : amountGuideStep === 1
                  ? "How your gift helps"
                  : "Keep your records"}
            </Text>
            <Text style={[styles.amountGuideDetailText, { color: c.textMuted }]}>
              {amountGuideStep === 0
                ? "Tap Continue to confirm your donation in secure checkout. We'll pause until payment is successful."
                : amountGuideStep === 1
                  ? `After payment is confirmed, your donation is directed to the selected organization. Review the breakdown before you finalize.`
                  : "When processing completes, you’ll be able to download or share your donation receipt."}
            </Text>

            <Text style={[styles.guideText, { color: c.textMuted }]}>
              {amountGuideStep === 0
                ? "1) Choose an amount, then tap Continue.\n2) Checkout is handled securely by Stripe."
                : amountGuideStep === 1
                  ? "Once payment is confirmed, your donation is directed to the selected verified organization.\nReview the breakdown before you finish."
                  : "After the donation is complete, you can download/share your receipt.\nYou can also track donations in your Profile."}
              {"\n\n"}
              {"GiveBlack details:\n• Verified organizations: Every org is vetted before it appears in the app.\n• Receipts: A donation receipt is provided for your records.\n• Tax-deductible: Your donation may be tax-deductible (based on the receiving organization’s status); keep your receipt.\n• Recurring donations: Not available yet (soon).\n• Refunds: Contact support within 48 hours for help."}
            </Text>
            <Pressable style={styles.guideLink} onPress={() => router.push("/settings/how-to-donate")}>
              <Text style={[styles.guideLinkText, { color: c.green }]}>Learn more</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 20 },
  centerContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 40 },
  centerText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 18, textAlign: "center" },

  partnerBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },

  processingMain: { flex: 1, alignItems: "stretch" },
  processingCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },

  // Bottom looping guide card shown while we wait for Stripe to confirm the donation.
  processingGuide: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  processingGuideRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  processingStage: { flex: 1, alignItems: "center", gap: 8 },
  processingStageIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  processingStageLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    textAlign: "center",
    maxWidth: 100,
  },
  processingGuideLine: {
    height: 3,
    borderRadius: 99,
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    opacity: 0.9,
  },
  processingGuideLineFill: {
    height: 3,
    borderRadius: 99,
    position: "absolute",
    left: 16,
    bottom: 16,
  },

  btn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, alignItems: "center" },
  btnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16, color: "#fff" },

  sectionTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, marginBottom: 16, textAlign: "center" },

  amountDisplay: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  amountInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dollarPrefix: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 40 },
  amountInput: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 40,
    minWidth: 80,
    textAlign: "center",
    paddingVertical: 0,
    paddingHorizontal: 0,
  },

  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  presetBtn: {
    width: "31%",
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 14,
    alignItems: "center",
    flexGrow: 1,
    flexBasis: "30%",
  },
  presetText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 16 },

  anonymousRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  anonymousText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 15 },

  guideCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    gap: 6,
  },
  guideTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14, marginBottom: 0 },
  guideText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, lineHeight: 18 },
  guideLink: { paddingVertical: 4 },
  guideLinkText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13 },

  amountGuideRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  amountGuideStage: { flex: 1, alignItems: "center", gap: 4 },
  amountGuideIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginBottom: 0,
  },
  amountGuideLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, textAlign: "center", maxWidth: 90 },
  amountGuideDetailTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13, marginTop: 8, marginBottom: 2 },
  amountGuideDetailText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12.5, lineHeight: 17 },

  card: { borderRadius: 16, padding: 20, marginBottom: 16 },

  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  feeLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, flex: 1 },
  feeValue: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  feePercent: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13, marginTop: 2 },
  feeDivider: { height: 1, marginVertical: 8 },
  feeToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },

  sliderRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  sliderLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12 },
  dotSlider: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sliderDot: { borderRadius: 5 },

  totalLabel: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 },
  totalValue: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 },

  donateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  donateBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 18, color: "#fff" },

  checkCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  receiptContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  receiptTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 24, textAlign: "center" },
  receiptSubtitle: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 15, textAlign: "center", marginTop: 4, marginBottom: 24 },

  receiptCard: { borderRadius: 16, padding: 20, width: "100%", marginBottom: 24 },
  receiptHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
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
  receiptDivider: { height: 1, marginVertical: 12 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  receiptRowLabel: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, flex: 1 },
  receiptRowValue: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  receiptTotalLabel: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 },
  receiptTotalValue: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },

  receiptActions: { flexDirection: "row", gap: 12, width: "100%", marginBottom: 16 },
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

  doneBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 16,
  },
  doneBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 18, color: "#fff" },

  authGateWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  authGateCard: {
    width: "100%",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  authGateIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  authGateHeading: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    textAlign: "center",
    lineHeight: 28,
  },
  authGateBody: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 4,
  },
  authGatePrimaryBtn: {
    width: "100%",
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
  },
  authGatePrimaryBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  authGateSecondaryBtn: {
    width: "100%",
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1.5,
  },
  authGateSecondaryBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
  },
  authGateBackLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    marginTop: 4,
  },
  authGateBackText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
  },
  authGateCharityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  authGateCharityText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
  },
  authGateCharityLink: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  authGateGuestBtn: {
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  authGateGuestBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
