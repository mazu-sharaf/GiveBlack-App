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
  ActivityIndicator,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { navigateAfterAuth } from "@/lib/auth-navigation";
import { alertDonorOAuthFailure } from "@/lib/donor-oauth-ui";
import { useThemeColors } from "@/context/ThemeContext";

export default function DonorLoginScreen() {
  const insets = useSafeInsets();
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const c = useThemeColors();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = params.returnTo ? String(params.returnTo) : undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<null | "google" | "apple">(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSignUp, setShowSignUp] = useState(false);
  const [showCharityLink, setShowCharityLink] = useState(false);
  const [showDonorCreateFromCharity, setShowDonorCreateFromCharity] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  // Note: Demo login shortcuts are intentionally removed for production use.

  async function handleLogin() {
    setErrorMessage("");
    setShowSignUp(false);
    setShowCharityLink(false);
    setShowDonorCreateFromCharity(false);
    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please enter email and password.");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await login(email.trim(), password, "donor");
    setLoading(false);
    if (result.success) {
      navigateAfterAuth("donor", returnTo);
    } else if (result.error) {
      setErrorMessage(result.error);
      if (result.errorType === "invalid_credentials") {
        setShowSignUp(true);
      }
      // If this email actually belongs to a charity/org account, show shortcuts to both charity login and donor signup
      if (result.error.includes("charity / organization")) {
        setShowCharityLink(true);
        setShowDonorCreateFromCharity(true);
      }
    }
  }

  async function runDonorOAuth(
    provider: "google" | "apple",
    fn: () => Promise<{ success: boolean; error?: string; errorType?: string }>
  ) {
    if (oauthBusy || loading) return;
    setOauthBusy(provider);
    try {
      const r = await fn();
      if (r.success) navigateAfterAuth("donor", returnTo);
      else alertDonorOAuthFailure(r, "donor-auth");
    } finally {
      setOauthBusy(null);
    }
  }

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
        <Text style={[styles.title, { color: c.text }]}>Login to your{"\n"}Account</Text>

        {!!errorMessage && (
          <View style={styles.errorBar}>
            <Ionicons name="alert-circle" size={20} color={Colors.white} style={{ marginRight: 10, marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              {showSignUp && (
                <Pressable
                  style={styles.errorSignUpBtn}
                  onPress={() => router.push({ pathname: "/(auth)/donor-signup", params: returnTo ? { returnTo } : {} })}
                >
                  <Text style={styles.errorSignUpText}>Sign Up</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.green} />
                </Pressable>
              )}
              {showDonorCreateFromCharity && (
                <Pressable
                  style={[styles.errorSignUpBtn, { marginTop: 8 }]}
                  onPress={() => router.push({ pathname: "/(auth)/donor-signup", params: { email: email.trim(), ...(returnTo ? { returnTo } : {}) } })}
                >
                  <Text style={styles.errorSignUpText}>Create donor account with this email</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.green} />
                </Pressable>
              )}
              {showCharityLink && (
                <Pressable
                  style={[styles.errorSignUpBtn, { marginTop: showDonorCreateFromCharity ? 8 : 10 }]}
                  onPress={() => router.push("/(auth)/charity-login")}
                >
                  <Text style={styles.errorSignUpText}>Go to Charity / Organization login</Text>
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
            placeholder="Email"
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

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
          <Text style={[styles.dividerLabel, { color: c.textMuted }]}>or continue with</Text>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
        </View>

        <View style={styles.socialRow}>
          <Pressable
            style={[styles.socialIcon, { borderColor: c.border, backgroundColor: c.cardBg }, !!oauthBusy && { opacity: 0.55 }]}
            disabled={!!oauthBusy || loading}
            onPress={() => runDonorOAuth("google", loginWithGoogle)}
            accessibilityLabel="Continue with Google"
          >
            <Ionicons name="logo-google" size={22} color="#DB4437" />
          </Pressable>
          {Platform.OS === "ios" && (
            <Pressable
              style={[styles.socialIcon, { borderColor: c.border, backgroundColor: c.cardBg }, !!oauthBusy && { opacity: 0.55 }]}
              disabled={!!oauthBusy || loading}
              onPress={() => runDonorOAuth("apple", loginWithApple)}
              accessibilityLabel="Continue with Apple"
            >
              <Ionicons name="logo-apple" size={22} color={c.text} />
            </Pressable>
          )}
        </View>
        {oauthBusy ? (
          <View style={styles.oauthRow}>
            <ActivityIndicator color={c.textMuted} />
            <Text style={[styles.oauthHint, { color: c.textMuted }]}>Signing in…</Text>
          </View>
        ) : null}

        <View style={styles.bottomRow}>
          <Text style={[styles.bottomLabel, { color: c.textMuted }]}>{"Don't have an account? "}</Text>
          <Pressable onPress={() => router.push({ pathname: "/(auth)/donor-signup", params: returnTo ? { returnTo } : {} })}>
            <Text style={styles.bottomLink}>Sign up</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.businessLink}
          onPress={() => router.push("/(auth)/charity-login")}
        >
          <Text style={styles.businessLinkText}>{"I'm a Business / Charity"}</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.green} />
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
    backgroundColor: Colors.cream,
  },
  header: {
    paddingHorizontal: 28,
    paddingBottom: 4,
    backgroundColor: Colors.cream,
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
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 36,
    color: Colors.primary,
    lineHeight: 44,
    marginBottom: 28,
  },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#991B1B",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
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
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.green,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F1F1",
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
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.primary,
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
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  signInBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  signInBtnText: {
    fontFamily: "Poppins_700Bold",
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
  },
  demoBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },
  forgotBtn: {
    alignSelf: "center",
    marginBottom: 24,
  },
  forgotText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.green,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  socialRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 24,
  },
  socialIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
  oauthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20,
  },
  oauthHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
  },
  bottomLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
  },
  bottomLink: {
    fontFamily: "Poppins_600SemiBold",
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
    backgroundColor: Colors.green + "10",
    marginBottom: 24,
    alignSelf: "center",
  },
  businessLinkText: {
    fontFamily: "Poppins_500Medium",
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
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
});
