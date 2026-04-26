import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { navigateAfterAuth } from "@/lib/auth-navigation";
import { useThemeColors } from "@/context/ThemeContext";

export default function CharityLoginScreen() {
  const insets = useSafeInsets();
  const { login } = useAuth();
  const c = useThemeColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSignUp, setShowSignUp] = useState(false);
  const [showRequestAccessFromDonor, setShowRequestAccessFromDonor] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  // Note: Demo login shortcuts are intentionally removed for production use.

  async function handleLogin() {
    setErrorMessage("");
    setShowSignUp(false);
    setShowRequestAccessFromDonor(false);
    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please enter email and password.");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await login(email.trim(), password, "charity");
    setLoading(false);

    if (result.success) {
      navigateAfterAuth("charity");
      return;
    }

    if (result.error) {
      setErrorMessage(result.error);
      if (result.errorType === "invalid_credentials") {
        setShowSignUp(true);
      }
      // If this email belongs to a donor account, show a shortcut to request charity access
      if (result.error.includes("donor account")) {
        setShowRequestAccessFromDonor(true);
      }
    }
  }

  // Demo login removed.

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: c.background }]}>
        <Pressable style={[styles.backBtn, { borderColor: c.border }]} onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 80 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
      >
        <View style={styles.badgeWrap}>
          <View style={styles.badge}>
            <Ionicons name="business-outline" size={20} color={Colors.green} />
            <Text style={styles.badgeText}>Charity / Organization</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: c.text }]}>Welcome Back!</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>Sign in to manage your charity account</Text>

        {!!errorMessage && (
          <View style={styles.errorBar}>
            <Ionicons name="alert-circle" size={20} color={Colors.white} style={{ marginRight: 10, marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              {(showSignUp || showRequestAccessFromDonor) && (
                <Pressable
                  style={styles.errorSignUpBtn}
                  onPress={() => router.push("/(auth)/charity-signup")}
                >
                  <Text style={styles.errorSignUpText}>Request Access</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.green} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
          <Ionicons name="mail-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Charity Email"
            placeholderTextColor={c.textMuted}
            value={email}
            onChangeText={(t) => { setEmail(t); setErrorMessage(""); setShowSignUp(false); }}
            keyboardType="email-address"
            autoCapitalize="none"
            testID="email-input"
          />
        </View>

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
          <Ionicons name="lock-closed-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Password"
            placeholderTextColor={c.textMuted}
            value={password}
            onChangeText={(t) => { setPassword(t); setErrorMessage(""); setShowSignUp(false); }}
            secureTextEntry={!showPassword}
            testID="password-input"
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
            <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={c.textMuted} />
          </Pressable>
        </View>

        <Pressable style={styles.rememberRow} onPress={() => setRememberMe(!rememberMe)}>
          <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
            {rememberMe && <Ionicons name="checkmark" size={13} color={Colors.white} />}
          </View>
          <Text style={[styles.rememberText, { color: c.text }]}>Remember me</Text>
        </Pressable>

        <Pressable
          style={[styles.signInBtn, loading && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={loading}
          testID="sign-in-btn"
        >
          <Text style={styles.signInBtnText}>{loading ? "Signing in..." : "Sign in"}</Text>
        </Pressable>

        <Pressable style={styles.forgotBtn} onPress={() => router.push("/(auth)/forgot-password")}>
          <Text style={styles.forgotText}>Forgot the password?</Text>
        </Pressable>

        <View style={styles.bottomRow}>
          <Text style={[styles.bottomLabel, { color: c.textMuted }]}>Need charity access? </Text>
          <Pressable onPress={() => router.push("/(auth)/charity-signup")}>
            <Text style={styles.bottomLink}>Request Access</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.donorLink}
          onPress={() => router.push("/(auth)/donor-login")}
        >
          <Ionicons name="arrow-back" size={14} color={Colors.green} />
          <Text style={styles.donorLinkText}>Back to Donor Login</Text>
        </Pressable>

        <View style={styles.footerRow}>
          <Pressable onPress={() => router.push("/settings/privacy-policy")}>
            <Text style={[styles.footerText, { color: c.textMuted }]}>Privacy Policy</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/settings/terms-of-service")}>
            <Text style={[styles.footerText, { color: c.textMuted }]}>Term of Service</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 28,
    paddingBottom: 4,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.green + "15",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  badgeText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.green,
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 32,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 28,
  },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.danger,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.white,
    lineHeight: 19,
  },
  errorSignUpBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 10,
    backgroundColor: Colors.white,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  errorSignUpText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.green,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
    alignSelf: "center",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.green,
  },
  rememberText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  signInBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  signInBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  demoBtn: {
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Colors.green,
    backgroundColor: Colors.white,
    alignSelf: "center",
  },
  demoBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
  },
  forgotBtn: {
    alignSelf: "center",
    marginBottom: 24,
  },
  forgotText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.green,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
  },
  bottomLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
  },
  bottomLink: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.green,
  },
  donorLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: Colors.green + "10",
    marginBottom: 24,
    alignSelf: "center",
  },
  donorLinkText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.green,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingBottom: 20,
    marginTop: 8,
  },
  footerText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
  },
});
