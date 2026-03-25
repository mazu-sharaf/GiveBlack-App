import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { useLocalSearchParams } from "expo-router";
import { navigateAfterAuth } from "@/lib/auth-navigation";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

export default function SignupSuccessScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { isAuthenticated, login } = useAuth();
  const params = useLocalSearchParams<{ name: string; email: string; password: string; zipCode: string }>();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  async function handleStart() {
    if (isAuthenticated) {
      navigateAfterAuth("donor");
      return;
    }
    if (params.email && params.password) {
      const result = await login(params.email, params.password, "donor");
      if (result.success) {
        navigateAfterAuth("donor");
      }
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad + 60, paddingBottom: bottomPad + 20 }]}>
      <View style={styles.confettiArea}>
        <View style={[styles.confettiDot, { top: 0, left: "15%", backgroundColor: Colors.gold }]} />
        <View style={[styles.confettiDot, { top: 20, right: "20%", backgroundColor: Colors.green }]} />
        <View style={[styles.confettiDot, { top: 50, left: "25%", backgroundColor: "#E74C3C" }]} />
        <View style={[styles.confettiDot, { top: 10, right: "15%", backgroundColor: "#3498DB" }]} />
        <View style={[styles.confettiRect, { top: 30, left: "10%", backgroundColor: Colors.green }]} />
        <View style={[styles.confettiRect, { top: 15, right: "25%", backgroundColor: Colors.gold }]} />
        <View style={[styles.confettiDot, { top: 40, right: "10%", backgroundColor: "#E74C3C" }]} />
        <View style={[styles.confettiRect, { top: 35, left: "35%", backgroundColor: "#3498DB" }]} />
        <View style={[styles.confettiDot, { top: 5, left: "50%", backgroundColor: "#9B59B6" }]} />
        <View style={[styles.confettiRect, { top: 45, right: "35%", backgroundColor: "#E74C3C" }]} />
      </View>

      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={56} color={Colors.white} />
      </View>

      <Text style={[styles.successTitle, { color: c.text }]}>Success</Text>

      <Text style={[styles.successSubtitle, { color: c.textMuted }]}>
        Congratulations, your account has been created. Start exploring causes and making a difference today.
      </Text>

      <View style={{ flex: 1 }} />

      <Pressable
        style={styles.startBtn}
        onPress={handleStart}
        testID="start-donating-btn"
      >
        <Text style={styles.startBtnText}>Start donating</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: "center",
    paddingHorizontal: 28,
  },
  confettiArea: {
    width: "100%",
    height: 60,
    position: "relative",
    marginBottom: 20,
  },
  confettiDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  confettiRect: {
    position: "absolute",
    width: 7,
    height: 16,
    borderRadius: 3,
    transform: [{ rotate: "25deg" }],
  },
  successCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  successTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 32,
    color: Colors.primary,
    marginBottom: 14,
  },
  successSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  startBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
  },
  startBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
});
