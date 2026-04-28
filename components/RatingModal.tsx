import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Linking,
  Platform,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";

const RATING_KEY = "@gb_rating_prompt";
const COOLDOWN_DAYS = 30;

const APP_STORE_URL = "https://apps.apple.com/app/id1474463975";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.giveblack.app";

export type RatingModalVariant = "default" | "first_donation" | "first_campaign";

interface StoredRating {
  rated: boolean;
  lastShown: number | null;
}

interface MilestoneStored {
  closed: boolean;
  rated?: boolean;
}

function milestoneStorageKey(variant: RatingModalVariant, milestoneId: string): string | null {
  if (variant === "first_donation") return `@gb_rating_milestone_first_donation:${milestoneId}`;
  if (variant === "first_campaign") return `@gb_rating_milestone_first_campaign:${milestoneId}`;
  return null;
}

async function shouldShowDefaultRating(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(RATING_KEY);
    if (!raw) return true;
    const stored: StoredRating = JSON.parse(raw);
    if (stored.rated) return false;
    if (stored.lastShown) {
      const daysSince = (Date.now() - stored.lastShown) / (1000 * 60 * 60 * 24);
      if (daysSince < COOLDOWN_DAYS) return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function shouldShowMilestoneRating(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return true;
    const stored = JSON.parse(raw) as MilestoneStored;
    if (stored?.closed) return false;
    return true;
  } catch {
    return true;
  }
}

async function markDefaultShown(rated: boolean) {
  try {
    const stored: StoredRating = { rated, lastShown: Date.now() };
    await AsyncStorage.setItem(RATING_KEY, JSON.stringify(stored));
  } catch {
    /* ignore */
  }
}

async function markMilestoneClosed(key: string, rated: boolean) {
  try {
    const stored: MilestoneStored = { closed: true, rated };
    await AsyncStorage.setItem(key, JSON.stringify(stored));
  } catch {
    /* ignore */
  }
}

interface RatingModalProps {
  delayMs?: number;
  /** Default = generic post-checkout prompt; milestone variants use per-user/org storage once. */
  variant?: RatingModalVariant;
  /** Required for `first_donation` (user id) and `first_campaign` (org id). */
  milestoneId?: string;
  /** Called after the modal finishes closing (backdrop hidden). */
  onFullyClosed?: () => void;
}

export default function RatingModal({
  delayMs = 2000,
  variant = "default",
  milestoneId,
  onFullyClosed,
}: RatingModalProps) {
  const c = useThemeColors();
  const [visible, setVisible] = useState(false);
  const [selectedStars, setSelectedStars] = useState(5);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState("");

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const starScales = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;
  const successScale = useRef(new Animated.Value(0)).current;

  const isMilestone = variant === "first_donation" || variant === "first_campaign";
  const milestoneKey =
    isMilestone && milestoneId ? milestoneStorageKey(variant, milestoneId) : null;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function decide() {
      if (isMilestone) {
        if (!milestoneKey) {
          onFullyClosed?.();
          return;
        }
        const show = await shouldShowMilestoneRating(milestoneKey);
        if (cancelled) return;
        if (!show) {
          onFullyClosed?.();
          return;
        }
        timer = setTimeout(() => setVisible(true), delayMs);
        return;
      }
      const show = await shouldShowDefaultRating();
      if (cancelled) return;
      if (!show) {
        onFullyClosed?.();
        return;
      }
      timer = setTimeout(() => setVisible(true), delayMs);
    }

    void decide();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [delayMs, variant, milestoneKey, isMilestone, onFullyClosed]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, backdropOpacity, cardScale, cardOpacity]);

  function animateStar(index: number) {
    Animated.sequence([
      Animated.spring(starScales[index], { toValue: 1.4, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.spring(starScales[index], { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
  }

  function handleStarPress(star: number) {
    setSelectedStars(star);
    animateStar(star - 1);
  }

  async function handleRateNow() {
    if (milestoneKey) {
      await markMilestoneClosed(milestoneKey, true);
    } else {
      await markDefaultShown(true);
    }
    setFeedback("");
    setSubmitted(true);
    Animated.spring(successScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
    setTimeout(() => {
      const url = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
      Linking.openURL(url).catch(() => {});
      dismiss();
    }, 1200);
  }

  async function handleLater() {
    if (milestoneKey) {
      await markMilestoneClosed(milestoneKey, false);
    } else {
      await markDefaultShown(false);
    }
    setFeedback("");
    dismiss();
  }

  function dismiss() {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      onFullyClosed?.();
    });
  }

  const title =
    variant === "first_donation"
      ? "Thanks for your first donation!"
      : variant === "first_campaign"
        ? "Your first campaign is on its way"
        : "Enjoying GiveBlack?";

  const subtitle =
    variant === "first_donation"
      ? "If GiveBlack made donating easy, a quick star rating helps other donors find us."
      : variant === "first_campaign"
        ? "You’re making an impact. Share how we’re doing on the store; it helps us grow."
        : "Your support means the world. Help others discover us by leaving a rating!";

  const iconName =
    variant === "first_campaign" ? ("rocket" as const) : variant === "first_donation" ? ("heart" as const) : ("heart" as const);

  const storeCta =
    Platform.OS === "ios" ? "Rate on the App Store" : Platform.OS === "android" ? "Rate on Google Play" : "Rate GiveBlack";

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleLater}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kav}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: c.cardBg,
                transform: [{ scale: cardScale }],
                opacity: cardOpacity,
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollInner}
            >
              {!submitted ? (
                <>
                  <View style={[styles.iconCircle, { backgroundColor: "rgba(5,150,105,0.12)" }]}>
                    <Ionicons name={iconName} size={32} color="#059669" />
                  </View>

                  <Text style={[styles.title, { color: c.text }]}>{title}</Text>
                  <Text style={[styles.subtitle, { color: c.textMuted }]}>{subtitle}</Text>

                  <Text style={[styles.feedbackLabel, { color: c.textMuted }]}>Optional feedback</Text>
                  <TextInput
                    style={[
                      styles.feedbackInput,
                      { color: c.text, borderColor: c.border, backgroundColor: c.background },
                    ]}
                    placeholder="Anything we could do better?"
                    placeholderTextColor={c.textLight}
                    multiline
                    maxLength={500}
                    value={feedback}
                    onChangeText={setFeedback}
                  />

                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Pressable key={star} onPress={() => handleStarPress(star)} hitSlop={8}>
                        <Animated.View style={{ transform: [{ scale: starScales[star - 1] }] }}>
                          <Ionicons
                            name={star <= selectedStars ? "star" : "star-outline"}
                            size={40}
                            color={star <= selectedStars ? "#F59E0B" : c.textLight}
                          />
                        </Animated.View>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[styles.starLabel, { color: c.textMuted }]}>
                    {selectedStars === 5
                      ? "Excellent!"
                      : selectedStars === 4
                        ? "Great!"
                        : selectedStars === 3
                          ? "It's okay"
                          : selectedStars === 2
                            ? "Not great"
                            : "Poor"}
                  </Text>

                  <Pressable style={[styles.rateBtn, { backgroundColor: "#059669" }]} onPress={handleRateNow}>
                    <Ionicons name="star" size={16} color="#fff" />
                    <Text style={styles.rateBtnText}>{storeCta}</Text>
                  </Pressable>

                  <Pressable style={styles.laterBtn} onPress={handleLater}>
                    <Text style={[styles.laterText, { color: c.textMuted }]}>Maybe Later</Text>
                  </Pressable>
                </>
              ) : (
                <Animated.View
                  style={[styles.successContent, { transform: [{ scale: successScale }] }]}
                >
                  <Ionicons name="checkmark-circle" size={64} color="#059669" />
                  <Text style={[styles.title, { color: c.text }]}>Thank You!</Text>
                  <Text style={[styles.subtitle, { color: c.textMuted }]}>
                    Your rating helps us grow and impact more lives.
                  </Text>
                </Animated.View>
              )}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "88%",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  scrollInner: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 16,
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 16,
  },
  feedbackLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    alignSelf: "stretch",
    marginBottom: 6,
  },
  feedbackInput: {
    alignSelf: "stretch",
    minHeight: 64,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    marginBottom: 16,
    textAlignVertical: "top",
  },
  starsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  starLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    marginBottom: 24,
  },
  rateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    borderRadius: 14,
    paddingVertical: 16,
    justifyContent: "center",
    marginBottom: 12,
  },
  rateBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  laterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  laterText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
  },
  successContent: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
});
