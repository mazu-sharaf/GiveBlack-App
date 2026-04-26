import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useThemeColors, useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { navigateAfterAuth } from "@/lib/auth-navigation";

import { logoWhite } from "@/constants/images";

function SocialButton({
  icon,
  label,
  onPress,
  c,
  disabled,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  c: { cardBg: string; border: string; text: string };
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.socialBtn, { backgroundColor: c.cardBg, borderColor: c.border }, disabled && { opacity: 0.55 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon as any} size={20} color={c.text} style={{ marginRight: 12 }} />
      <Text style={[styles.socialBtnText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { isDark } = useTheme();
  const { guestLogin, isAuthenticated, isGuest, isLoading, user, loginWithGoogle, loginWithApple } = useAuth();
  const [oauthBusy, setOauthBusy] = useState<null | "google" | "apple">(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  async function runOAuth(
    provider: "google" | "apple",
    fn: () => Promise<{ success: boolean; error?: string; errorType?: string }>
  ) {
    if (oauthBusy) return;
    setOauthBusy(provider);
    try {
      const r = await fn();
      if (r.success) return;
      if (r.errorType === "cancelled") return;
      const msg = r.error?.trim() || "Sign-in failed. Please try again.";
      if (r.errorType === "conflict") {
        Alert.alert("Account exists", msg, [
          { text: "Cancel", style: "cancel" },
          { text: "Sign in with password", onPress: () => router.push("/(auth)/donor-login") },
        ]);
        return;
      }
      Alert.alert("Sign-in", msg);
    } finally {
      setOauthBusy(null);
    }
  }

  useEffect(() => {
    if (isLoading || !isAuthenticated || isGuest || !user?.id) return;
    navigateAfterAuth(user.type === "charity" ? "charity" : "donor");
  }, [isLoading, isAuthenticated, isGuest, user?.id, user?.type]);

  async function handleGuestLogin() {
    await guestLogin();
    navigateAfterAuth("donor");
  }

  return (
    <View style={[styles.container, { backgroundColor: "#080E0C" }]}>
      <LinearGradient
        colors={["#0D1F14", "#080E0C"]}
        style={styles.heroBg}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 1 }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 48 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoArea}>
          <Image source={logoWhite} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />
          <Text style={styles.tagline}>The Home of Black Philanthropy</Text>
        </View>

        <View style={[styles.authCard, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : c.cardBg, borderColor: isDark ? "rgba(255,255,255,0.08)" : c.border }]}>
          <Text style={styles.cardTitle}>{"Let's Get Started"}</Text>

          <View style={styles.socialGroup}>
            <SocialButton
              icon="logo-google"
              label="Continue with Google"
              c={isDark ? { cardBg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)", text: Colors.white } : c}
              disabled={!!oauthBusy}
              onPress={() => runOAuth("google", loginWithGoogle)}
            />
            {Platform.OS === "ios" && (
              <SocialButton
                icon="logo-apple"
                label="Continue with Apple"
                c={isDark ? { cardBg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)", text: Colors.white } : c}
                disabled={!!oauthBusy}
                onPress={() => runOAuth("apple", loginWithApple)}
              />
            )}
          </View>

          {oauthBusy ? (
            <View style={styles.oauthSpinnerRow}>
              <ActivityIndicator color={Colors.green} />
              <Text style={styles.oauthSpinnerText}>Signing in…</Text>
            </View>
          ) : null}

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : c.border }]} />
            <Text style={[styles.dividerText, { color: isDark ? "rgba(255,255,255,0.4)" : c.textMuted }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : c.border }]} />
          </View>

          <Pressable
            style={styles.passwordBtn}
            onPress={() => router.push("/(auth)/donor-login")}
            testID="sign-in-password-btn"
          >
            <Text style={styles.passwordBtnText}>Sign in with password</Text>
          </Pressable>

          <View style={styles.signupRow}>
            <Text style={[styles.signupLabel, { color: isDark ? "rgba(255,255,255,0.5)" : c.textMuted }]}>{"Don't have an account? "}</Text>
            <Pressable onPress={() => router.push("/(auth)/donor-signup")}>
              <Text style={styles.signupLink}>Sign up</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.businessLink}
            onPress={() => router.push("/(auth)/charity-login")}
          >
            <Text style={styles.businessLinkText}>{"I'm a Business / Charity"}</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.green} />
          </Pressable>
        </View>

        <Pressable
          style={[styles.guestBtn, { borderColor: isDark ? "rgba(255,255,255,0.15)" : c.border }]}
          onPress={handleGuestLogin}
          testID="guest-login-btn"
        >
          <Ionicons name="person-outline" size={18} color={isDark ? "rgba(255,255,255,0.5)" : c.textMuted} style={{ marginRight: 8 }} />
          <Text style={[styles.guestBtnText, { color: isDark ? "rgba(255,255,255,0.5)" : c.textMuted }]}>Continue as Guest</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footerRow, { paddingBottom: bottomPad + 16, borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "#E0E0E0" }]}>
        <Pressable onPress={() => router.push("/settings/privacy-policy")}>
          <Text style={[styles.footerText, { color: isDark ? "rgba(255,255,255,0.35)" : c.textMuted }]}>Privacy Policy</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/settings/terms-of-service")}>
          <Text style={[styles.footerText, { color: isDark ? "rgba(255,255,255,0.35)" : c.textMuted }]}>Terms of Service</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroBg: {
    ...StyleSheet.absoluteFillObject,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
    paddingBottom: 20,
  },
  logoArea: {
    alignItems: "center",
    marginBottom: 36,
    gap: 10,
  },
  logo: {
    width: 190,
    height: 48,
  },
  tagline: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  authCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    color: Colors.white,
    textAlign: "center",
    marginBottom: 20,
  },
  socialGroup: {
    width: "100%",
    gap: 12,
    marginBottom: 12,
  },
  oauthSpinnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  oauthSpinnerText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 15,
  },
  socialBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
  },
  passwordBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },
  passwordBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
  },
  signupLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
  },
  signupLink: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.green,
  },
  businessLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: Colors.green + "15",
  },
  businessLinkText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.green,
  },
  guestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    width: "100%",
    borderRadius: 30,
    borderWidth: 1,
  },
  guestBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 38,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
  },
});
