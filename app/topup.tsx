import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { apiPost } from "@/lib/query-client";
import * as WebBrowser from "expo-web-browser";

const PRESET_AMOUNTS = [5, 10, 25, 50, 100, 200];
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Step = "amount" | "payment" | "addCard" | "pin" | "success";

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  size: number;
  type: "rect" | "circle" | "arc";
}

const CONFETTI_COLORS = [
  Colors.green,
  "#FFD700",
  "#FF6B6B",
  "#4ECDC4",
  "#FF8C42",
  "#45B7D1",
  "#96CEB4",
];

function generateConfetti(): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < 30; i++) {
    pieces.push({
      id: i,
      x: Math.random() * SCREEN_WIDTH,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 8 + Math.random() * 12,
      type: ["rect", "circle", "arc"][Math.floor(Math.random() * 3)] as ConfettiPiece["type"],
    });
  }
  return pieces;
}

function ConfettiItem({ piece }: { piece: ConfettiPiece }) {
  const translateY = useSharedValue(-60);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const duration = 2000 + Math.random() * 1500;
    translateY.value = withTiming(SCREEN_WIDTH * 1.8, {
      duration,
      easing: Easing.out(Easing.quad),
    });
    rotate.value = withRepeat(
      withTiming(360, { duration: 1000 + Math.random() * 1000 }),
      -1,
      false
    );
    opacity.value = withDelay(
      duration - 600,
      withTiming(0, { duration: 600 })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: piece.x,
          top: -20,
          width: piece.type === "circle" ? piece.size : piece.size * 0.6,
          height: piece.size,
          backgroundColor: piece.color,
          borderRadius: piece.type === "circle" ? piece.size / 2 : 2,
        },
        animStyle,
      ]}
    />
  );
}

export default function TopUpScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { isDark } = useTheme();
  const { topUpWallet, walletBalance, savedCards, addCard, verifyPin, userProfile, setPinHash } = useApp();
  const { session, isAuthenticated, isGuest } = useAuth();
  const [step, setStep] = useState<Step>("amount");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [confetti] = useState<ConfettiPiece[]>(() => generateConfetti());
  const pinInputRef = useRef<TextInput>(null);

  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const bottomPad = insets.bottom;

  const finalAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount || 0;

  function handleSelectPreset(amt: number) {
    setSelectedAmount(amt);
    setCustomAmount("");
  }

  function handleContinueAmount() {
    if (finalAmount > 0) {
      setStep("payment");
    }
  }

  function handleContinuePayment() {
    if (selectedPayment) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPin("");
      setStep("pin");
      setTimeout(() => pinInputRef.current?.focus(), 300);
    }
  }

  function handleGoToAddCard() {
    setCardName("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setStep("addCard");
  }

  function handleAddCard() {
    if (!cardName.trim() || cardNumber.length < 4 || !cardExpiry.trim()) return;
    const last4 = cardNumber.slice(-4);
    const brand = cardNumber.startsWith("5") ? "mastercard" as const : "visa" as const;
    addCard({ name: cardName.trim(), last4, expiry: cardExpiry, brand });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep("payment");
  }

  async function processTopUp() {
    if (!isAuthenticated || isGuest || !session?.accessToken) {
      setPinError("Please log in to top up your wallet.");
      return false;
    }
    try {
      const token = session.accessToken;

      const checkoutRes = await apiPost<{
        url?: string;
        sessionId?: string;
      }>(
        "/api/payments/topup-checkout",
        { amount: finalAmount },
        token
      );

      if (!checkoutRes.url) {
        throw new Error("Payment service unavailable.");
      }

      const browserResult = await WebBrowser.openBrowserAsync(checkoutRes.url);
      if (browserResult.type === "cancel") {
        return false;
      }

      topUpWallet(finalAmount);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPinError(msg);
      return false;
    }
  }

  async function handleConfirmPin() {
    if (pin.length < 5 || isProcessing) return;

    const now = Date.now();
    if (lockoutUntil > now) {
      setPinError(`Too many attempts. Try again in ${Math.ceil((lockoutUntil - now) / 1000)}s`);
      return;
    }

    setIsProcessing(true);
    setPinError("");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!userProfile.pinHash) {
      await setPinHash(pin);
      const success = await processTopUp();
      if (success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStep("success");
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setIsProcessing(false);
      return;
    }

    const valid = await verifyPin(pin);
    if (!valid) {
      const attempts = pinAttempts + 1;
      setPinAttempts(attempts);
      if (attempts >= 3) {
        setLockoutUntil(Date.now() + 30000);
        setPinError("Too many failed attempts. Locked for 30 seconds.");
        setTimeout(() => { setPinError(""); setPinAttempts(0); }, 30000);
      } else {
        setPinError(`Incorrect PIN. ${3 - attempts} attempts remaining.`);
      }
      setPin("");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsProcessing(false);
      return;
    }

    const success = await processTopUp();
    if (success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("success");
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setIsProcessing(false);
  }

  function handleBack() {
    if (step === "payment") setStep("amount");
    else if (step === "addCard") setStep("payment");
    else if (step === "pin") setStep("payment");
    else router.back();
  }

  const stepTitles: Record<string, string> = {
    amount: "Top Up",
    payment: "Payment Method",
    addCard: "Add New Card",
    pin: "Enter PIN",
  };

  if (step === "success") {
    return (
      <View style={[styles.successContainer, { paddingBottom: bottomPad + 20, backgroundColor: c.cardBg }]}>
        {confetti.map((piece) => (
          <ConfettiItem key={piece.id} piece={piece} />
        ))}
        <Animated.View entering={FadeIn.delay(200).duration(500)} style={styles.successContent}>
          <View style={[styles.successCheckCircle, { borderColor: c.green }]}>
            <Ionicons name="checkmark" size={48} color={c.green} />
          </View>
          <Text style={[styles.successTitle, { color: c.text }]}>Success</Text>
          <Text style={[styles.successMsg, { color: c.textMuted }]}>
            ${finalAmount.toFixed(0)} has been added to your wallet
          </Text>
          <Pressable
            style={[styles.okBtn, { backgroundColor: c.green }]}
            onPress={() => router.back()}
          >
            <Text style={styles.okBtnText}>OK</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  if (step === "addCard") {
    const displayNum = cardNumber.replace(/(\d{4})/g, "$1 ").trim();
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ScrollView style={styles.bodyContent} showsVerticalScrollIndicator={false} keyboardDismissMode="interactive">
          <Animated.View entering={FadeInDown.duration(350)}>
            <View style={[styles.cardPreview, { backgroundColor: c.green }]}>
              <Text style={styles.cardPreviewLabel}>Card Number</Text>
              <Text style={styles.cardPreviewNumber}>
                {displayNum || "**** **** **** ****"}
              </Text>
              <View style={styles.cardPreviewRow}>
                <View>
                  <Text style={styles.cardPreviewLabel}>Card Holder</Text>
                  <Text style={styles.cardPreviewValue}>
                    {cardName || "YOUR NAME"}
                  </Text>
                </View>
                <View>
                  <Text style={styles.cardPreviewLabel}>Expires</Text>
                  <Text style={styles.cardPreviewValue}>
                    {cardExpiry || "MM/YY"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: c.textMuted }]}>Card Holder Name</Text>
              <TextInput
                style={[styles.formInput, { color: c.text, backgroundColor: c.cardBg, borderColor: c.border }]}
                value={cardName}
                onChangeText={setCardName}
                placeholder="John Doe"
                placeholderTextColor={c.textLight}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: c.textMuted }]}>Card Number</Text>
              <TextInput
                style={[styles.formInput, { color: c.text, backgroundColor: c.cardBg, borderColor: c.border }]}
                value={cardNumber}
                onChangeText={(t) => setCardNumber(t.replace(/[^0-9]/g, "").slice(0, 16))}
                placeholder="1234567890123456"
                placeholderTextColor={c.textLight}
                keyboardType="number-pad"
                maxLength={16}
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Expiry</Text>
                <TextInput
                  style={[styles.formInput, { color: c.text, backgroundColor: c.cardBg, borderColor: c.border }]}
                  value={cardExpiry}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9/]/g, "");
                    if (cleaned.length === 2 && !cleaned.includes("/") && cardExpiry.length < 3) {
                      setCardExpiry(cleaned + "/");
                    } else {
                      setCardExpiry(cleaned.slice(0, 5));
                    }
                  }}
                  placeholder="MM/YY"
                  placeholderTextColor={c.textLight}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
              <View style={{ width: 14 }} />
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>CVV</Text>
                <TextInput
                  style={[styles.formInput, { color: c.text, backgroundColor: c.cardBg, borderColor: c.border }]}
                  value={cardCvv}
                  onChangeText={(t) => setCardCvv(t.replace(/[^0-9]/g, "").slice(0, 4))}
                  placeholder="123"
                  placeholderTextColor={c.textLight}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>
          </Animated.View>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: bottomPad > 0 ? bottomPad : 16, backgroundColor: c.background, borderTopColor: c.border }]}>
          <Pressable
            style={[
              styles.continueBtn,
              { backgroundColor: c.green },
              (!cardName.trim() || cardNumber.length < 4 || !cardExpiry.trim()) && styles.continueBtnDisabled,
            ]}
            onPress={handleAddCard}
            disabled={!cardName.trim() || cardNumber.length < 4 || !cardExpiry.trim()}
          >
            <Text style={styles.continueBtnText}>Add New Card</Text>
          </Pressable>
        </View>
      </View>
      </KeyboardAvoidingView>
    );
  }

  if (step === "pin") {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.bodyContent}>
          <Text style={[styles.pinSubtitle, { color: c.text }]}>Please Enter your PIN</Text>

          <Pressable style={styles.pinRow} onPress={() => pinInputRef.current?.focus()}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[
                  styles.pinBox,
                  { backgroundColor: c.cardBg, borderColor: c.border },
                  pin.length === i && { borderColor: c.green },
                  pin.length > i && { borderColor: c.text, backgroundColor: isDark ? "#2A2A2A" : "#FAFAFA" },
                ]}
              >
                {pin.length > i ? (
                  <View style={[styles.pinDot, { backgroundColor: c.text }]} />
                ) : pin.length === i ? (
                  <View style={[styles.pinCursor, { backgroundColor: c.green }]} />
                ) : null}
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={pinInputRef}
            style={styles.hiddenInput}
            keyboardType="number-pad"
            maxLength={5}
            value={pin}
            onChangeText={setPin}
            autoFocus
          />

          {!userProfile.pinHash && (
            <Text style={[styles.pinHint, { color: c.green }]}>Create a 5-digit PIN for future payments</Text>
          )}

          {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

          <Pressable
            style={[
              styles.continueBtn,
              { backgroundColor: c.green },
              (pin.length < 5 || isProcessing) && styles.continueBtnDisabled,
            ]}
            onPress={handleConfirmPin}
            disabled={pin.length < 5 || isProcessing}
          >
            <Text style={styles.continueBtnText}>
              {isProcessing ? "Processing..." : "Confirm"}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
      </KeyboardAvoidingView>
    );
  }

  if (step === "payment") {
    const secureCheckoutOption = {
      id: "secure_checkout",
      name: "Card or wallet (secure checkout)",
      icon: "shield-checkmark-outline" as const,
    };

    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.bodyContent}>
          <Text style={[styles.amountDisplay, { color: c.text }]}>${finalAmount.toFixed(0)}</Text>
          <Text style={[styles.amountLabel, { color: c.textMuted }]}>Top up amount</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.paymentList}>
              {savedCards.map((card) => (
                <Pressable
                  key={card.id}
                  style={[
                    styles.paymentRow,
                    { backgroundColor: c.cardBg, borderColor: c.border },
                    selectedPayment === card.id && { borderColor: c.green },
                  ]}
                  onPress={() => setSelectedPayment(card.id)}
                >
                  <View style={[styles.paymentIconWrap, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5" }]}>
                    <Ionicons name="card-outline" size={24} color={c.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paymentName, { color: c.text }]}>
                      {card.brand === "mastercard" ? "Mastercard" : "Visa"} ****{card.last4}
                    </Text>
                    <Text style={[styles.paymentSub, { color: c.textMuted }]}>{card.name}</Text>
                  </View>
                  {selectedPayment === card.id && (
                    <Ionicons name="checkmark-circle" size={22} color={c.green} />
                  )}
                </Pressable>
              ))}

              <Pressable
                style={[
                  styles.paymentRow,
                  { backgroundColor: c.cardBg, borderColor: c.border },
                  selectedPayment === secureCheckoutOption.id && { borderColor: c.green },
                ]}
                onPress={() => setSelectedPayment(secureCheckoutOption.id)}
              >
                <View style={[styles.paymentIconWrap, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5" }]}>
                  <Ionicons name={secureCheckoutOption.icon} size={24} color={c.text} />
                </View>
                <Text style={[styles.paymentName, { flex: 1, color: c.text }]}>{secureCheckoutOption.name}</Text>
                {selectedPayment === secureCheckoutOption.id && (
                  <Ionicons name="checkmark-circle" size={22} color={c.green} />
                )}
              </Pressable>

              <Pressable style={[styles.addCardRow, { borderColor: c.green }]} onPress={handleGoToAddCard}>
                <Ionicons name="add-circle-outline" size={24} color={c.green} />
                <Text style={[styles.addCardText, { color: c.green }]}>Add New Card</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>

        <View style={[styles.bottomBar, { paddingBottom: bottomPad > 0 ? bottomPad : 16, backgroundColor: c.background, borderTopColor: c.border }]}>
          <Pressable
            style={[styles.continueBtn, { backgroundColor: c.green }, !selectedPayment && styles.continueBtnDisabled]}
            onPress={handleContinuePayment}
            disabled={!selectedPayment}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.bodyContent}>
        <View style={[styles.amountInputWrap, { borderBottomColor: c.green }]}>
          <Text style={[styles.dollarPrefix, { color: c.text }]}>$</Text>
          <TextInput
            style={[styles.amountInput, { color: c.text }]}
            value={customAmount || (selectedAmount ? String(selectedAmount) : "0")}
            onChangeText={(t) => {
              setCustomAmount(t.replace(/[^0-9.]/g, ""));
              setSelectedAmount(null);
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={c.textLight}
          />
        </View>

        <View style={styles.presetGrid}>
          {PRESET_AMOUNTS.map((amt) => (
            <Pressable
              key={amt}
              style={[
                styles.presetBtn,
                { backgroundColor: c.cardBg, borderColor: c.border },
                selectedAmount === amt && !customAmount && { backgroundColor: c.green, borderColor: c.green },
              ]}
              onPress={() => handleSelectPreset(amt)}
            >
              <Text
                style={[
                  styles.presetBtnText,
                  { color: c.text },
                  selectedAmount === amt && !customAmount && styles.presetBtnTextActive,
                ]}
              >
                ${amt}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: bottomPad > 0 ? bottomPad : 16, backgroundColor: c.background, borderTopColor: c.border }]}>
        <Pressable
          style={[styles.continueBtn, { backgroundColor: c.green }, finalAmount <= 0 && styles.continueBtnDisabled]}
          onPress={handleContinueAmount}
          disabled={finalAmount <= 0}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
  },
  bodyContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  amountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    borderBottomWidth: 2,
    paddingBottom: 12,
    alignSelf: "center",
    minWidth: 150,
  },
  dollarPrefix: {
    fontFamily: "Poppins_700Bold",
    fontSize: 40,
  },
  amountInput: {
    fontFamily: "Poppins_700Bold",
    fontSize: 40,
    minWidth: 60,
    textAlign: "center",
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  presetBtn: {
    width: "28%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1.5,
  },
  presetBtnActive: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
  },
  presetBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  presetBtnTextActive: {
    color: "#FFFFFF",
  },
  amountDisplay: {
    fontFamily: "Poppins_700Bold",
    fontSize: 40,
    textAlign: "center",
    marginBottom: 4,
  },
  amountLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 30,
  },
  paymentList: {
    gap: 12,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1.5,
  },
  paymentRowActive: {
    borderColor: Colors.green,
  },
  paymentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
  },
  paymentSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  addCardRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  addCardText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  continueBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  continueBtnDisabled: {
    opacity: 0.4,
  },
  continueBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  pinSubtitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    marginTop: 20,
  },
  pinRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginBottom: 40,
    marginTop: 12,
  },
  pinBox: {
    width: 56,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pinBoxActive: {
    borderColor: Colors.green,
  },
  pinBoxFilled: {
    backgroundColor: "#FAFAFA",
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  pinCursor: {
    width: 2,
    height: 24,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 0,
    width: 0,
  },
  pinHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center" as const,
    marginTop: 8,
    marginBottom: 4,
  },
  pinErrorText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#E74C3C",
    textAlign: "center" as const,
    marginTop: 8,
  },
  cardPreview: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
  },
  cardPreviewLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 4,
  },
  cardPreviewNumber: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 20,
    color: "#FFFFFF",
    letterSpacing: 2,
    marginBottom: 20,
  },
  cardPreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardPreviewValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  formGroup: {
    marginBottom: 18,
  },
  formLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    marginBottom: 8,
  },
  formInput: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  formRow: {
    flexDirection: "row",
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  successContent: {
    alignItems: "center",
    zIndex: 10,
  },
  successCheckCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  successTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 36,
    marginBottom: 12,
  },
  successMsg: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 40,
  },
  okBtn: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 80,
    alignItems: "center",
  },
  okBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "#FFFFFF",
  },
});
