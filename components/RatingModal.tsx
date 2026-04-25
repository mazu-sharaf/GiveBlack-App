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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";

const RATING_KEY = "@gb_rating_prompt";
const COOLDOWN_DAYS = 30;

const APP_STORE_URL = "https://apps.apple.com/app/giveblack/id0000000000";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.giveblack.app";

interface StoredRating {
  rated: boolean;
  lastShown: number | null;
}

async function shouldShowRating(): Promise<boolean> {
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

async function markShown(rated: boolean) {
  try {
    const stored: StoredRating = { rated, lastShown: Date.now() };
    await AsyncStorage.setItem(RATING_KEY, JSON.stringify(stored));
  } catch {}
}

interface RatingModalProps {
  delayMs?: number;
}

export default function RatingModal({ delayMs = 2000 }: RatingModalProps) {
  const c = useThemeColors();
  const [visible, setVisible] = useState(false);
  const [selectedStars, setSelectedStars] = useState(5);
  const [submitted, setSubmitted] = useState(false);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const starScales = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;
  const successScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    shouldShowRating().then((show) => {
      if (show) {
        timer = setTimeout(() => setVisible(true), delayMs);
      }
    });
    return () => clearTimeout(timer);
  }, [delayMs]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

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
    await markShown(true);
    setSubmitted(true);
    Animated.spring(successScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
    setTimeout(() => {
      const url = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
      Linking.openURL(url).catch(() => {});
      dismiss();
    }, 1200);
  }

  async function handleLater() {
    await markShown(false);
    dismiss();
  }

  function dismiss() {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleLater}>
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
          {!submitted ? (
            <>
              <View style={[styles.iconCircle, { backgroundColor: "rgba(5,150,105,0.12)" }]}>
                <Ionicons name="heart" size={32} color="#059669" />
              </View>

              <Text style={[styles.title, { color: c.text }]}>Enjoying GiveBlack?</Text>
              <Text style={[styles.subtitle, { color: c.textMuted }]}>
                Your support means the world. Help others discover us by leaving a rating!
              </Text>

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

              <Pressable
                style={[styles.rateBtn, { backgroundColor: "#059669" }]}
                onPress={handleRateNow}
              >
                <Ionicons name="star" size={16} color="#fff" />
                <Text style={styles.rateBtnText}>Rate on the App Store</Text>
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
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
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
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  starsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  starLabel: {
    fontFamily: "Poppins_500Medium",
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
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  laterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  laterText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  successContent: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
});
