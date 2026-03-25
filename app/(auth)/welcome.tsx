import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useThemeColors, useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { navigateAfterAuth } from "@/lib/auth-navigation";

import { logoBlack, logoWhite } from "@/constants/images";

function SocialButton({ icon, label, onPress, c }: { icon: string; label: string; onPress?: () => void; c: any }) {
  return (
    <Pressable style={[styles.socialBtn, { backgroundColor: c.cardBg, borderColor: c.border }]} onPress={onPress}>
      <Ionicons name={icon as any} size={20} color={c.text} style={{ marginRight: 12 }} />
      <Text style={[styles.socialBtnText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { isDark } = useTheme();
  const { guestLogin, isAuthenticated, isGuest, isLoading, user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  useEffect(() => {
    if (isLoading || !isAuthenticated || isGuest || !user?.id) return;
    navigateAfterAuth(user.type === "charity" ? "charity" : "donor");
  }, [isLoading, isAuthenticated, isGuest, user?.id, user?.type]);

  async function handleGuestLogin() {
    await guestLogin();
    navigateAfterAuth("donor");
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 30 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoArea}>
          <Image source={isDark ? logoWhite : logoBlack} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />
        </View>

        <Text style={[styles.title, { color: c.text }]}>Let's Get Started!</Text>

        <View style={styles.socialGroup}>
          <SocialButton icon="logo-facebook" label="Continue with Facebook" c={c} />
          <SocialButton icon="logo-google" label="Continue with Google" c={c} />
          <SocialButton icon="logo-apple" label="Continue with Apple" c={c} />
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
          <Text style={[styles.dividerText, { color: c.textMuted }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
        </View>

        <Pressable
          style={styles.passwordBtn}
          onPress={() => router.push("/(auth)/donor-login")}
          testID="sign-in-password-btn"
        >
          <Text style={styles.passwordBtnText}>Sign in with password</Text>
        </Pressable>

        <View style={styles.signupRow}>
          <Text style={[styles.signupLabel, { color: c.textMuted }]}>Don't have an account? </Text>
          <Pressable onPress={() => router.push("/(auth)/donor-signup")}>
            <Text style={styles.signupLink}>Sign up</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.businessLink}
          onPress={() => router.push("/(auth)/charity-login")}
        >
          <Text style={styles.businessLinkText}>I'm a Business / Charity</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.green} />
        </Pressable>

        <Pressable
          style={[styles.guestBtn, { borderColor: c.border }]}
          onPress={handleGuestLogin}
          testID="guest-login-btn"
        >
          <Ionicons name="person-outline" size={18} color={c.textMuted} style={{ marginRight: 8 }} />
          <Text style={[styles.guestBtnText, { color: c.textMuted }]}>Continue as Guest</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footerRow, { paddingBottom: bottomPad + 16 }]}>
        <Pressable onPress={() => router.push("/settings/privacy-policy")}>
          <Text style={[styles.footerText, { color: c.textMuted }]}>Privacy Policy</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/settings/terms-of-service")}>
          <Text style={[styles.footerText, { color: c.textMuted }]}>Term of Service</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    alignItems: "center",
    paddingBottom: 20,
  },
  logoArea: {
    marginBottom: 20,
    alignItems: "center",
  },
  logo: {
    width: 180,
    height: 46,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    textAlign: "center",
    marginBottom: 28,
  },
  socialGroup: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
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
    fontFamily: "Poppins_600SemiBold",
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
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  passwordBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  passwordBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
  },
  signupLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  signupLink: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.green,
  },
  businessLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: Colors.green + "10",
  },
  businessLinkText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.green,
  },
  guestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    paddingVertical: 14,
    width: "100%",
    borderRadius: 30,
    borderWidth: 1,
  },
  guestBtnText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 38,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E0E0E0",
  },
  footerText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
});
