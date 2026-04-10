import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeInsets } from "@/lib/safe-area";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useThemeColors } from "@/context/ThemeContext";
import { getApiUrl } from "@/lib/query-client";
import { navigateAfterAuth } from "@/lib/auth-navigation";
import { alertDonorOAuthFailure } from "@/lib/donor-oauth-ui";

export default function DonorSignupScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { signUpDonor, loginWithGoogle, loginWithApple } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(params.email ? String(params.email) : "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<null | "google" | "apple">(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;

  async function pickAvatar() {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow access to your photo library.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setAvatarUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Could not open photo library.");
    }
  }

  async function uploadAvatar(uri: string): Promise<string | null> {
    try {
      const token = await AsyncStorage.getItem("@gb_access_token");
      if (!token) return null;

      const base = getApiUrl().replace(/\/$/, "");
      const formData = new FormData();

      if (Platform.OS === "web") {
        const res = await fetch(uri);
        const blob = await res.blob();
        formData.append("file", blob, "avatar.jpg");
      } else {
        const filename = uri.split("/").pop() || "avatar.jpg";
        const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
        const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        formData.append("file", { uri, name: filename, type: mime } as any);
      }

      const uploadRes = await fetch(`${base}/api/upload/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) return null;
      const data = await uploadRes.json();

      await fetch(`${base}/api/profile/avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatar_url: data.url }),
      });

      return data.url;
    } catch {
      return null;
    }
  }

  async function handleSignUp() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }
    if (!agreedToTerms) {
      Alert.alert("Terms Required", "Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const success = await signUpDonor({
      name: fullName,
      email: email.trim(),
      password,
      zipCode: "",
      collegeAttended: false,
    });

    if (success && avatarUri) {
      await uploadAvatar(avatarUri);
    }

    setLoading(false);
    if (success) {
      router.replace({ pathname: "/(auth)/signup-success", params: { name: firstName } });
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
      if (r.success) navigateAfterAuth("donor");
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
        <Text style={[styles.title, { color: c.text }]}>Create your{"\n"}Account</Text>

        {/* Avatar picker */}
        <Pressable style={styles.avatarWrap} onPress={pickAvatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: c.inputBg, borderColor: c.border }]}>
              <Ionicons name="camera-outline" size={28} color={c.textMuted} />
            </View>
          )}
          <View style={[styles.avatarBadge, { backgroundColor: c.green }]}>
            <Ionicons name="add" size={14} color="#fff" />
          </View>
        </Pressable>
        <Text style={[styles.avatarHint, { color: c.textMuted }]}>
          {avatarUri ? "Tap to change photo" : "Add profile photo"}
        </Text>

        {/* First name + Last name side by side */}
        <View style={styles.nameRow}>
          <View style={[styles.inputWrap, styles.nameInput, { backgroundColor: c.inputBg }]}>
            <Ionicons name="person-outline" size={18} color={c.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: c.text }]}
              placeholder="First Name"
              placeholderTextColor={c.textMuted}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              testID="first-name-input"
            />
          </View>
          <View style={[styles.inputWrap, styles.nameInput, { backgroundColor: c.inputBg }]}>
            <TextInput
              style={[styles.input, { color: c.text }]}
              placeholder="Last Name"
              placeholderTextColor={c.textMuted}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              testID="last-name-input"
            />
          </View>
        </View>

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
          <Ionicons name="mail-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Email"
            placeholderTextColor={c.textMuted}
            value={email}
            onChangeText={setEmail}
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
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            testID="password-input"
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
            <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={c.textMuted} />
          </Pressable>
        </View>

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
          <Ionicons name="lock-closed-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Confirm Password"
            placeholderTextColor={c.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            testID="confirm-password-input"
          />
          <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} hitSlop={8}>
            <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={20} color={c.textMuted} />
          </Pressable>
        </View>

        <Pressable style={styles.rememberRow} onPress={() => setAgreedToTerms(!agreedToTerms)}>
          <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
            {agreedToTerms && <Ionicons name="checkmark" size={13} color={Colors.white} />}
          </View>
          <Text style={[styles.rememberText, { color: c.text }]}>I agree to the Terms of Service and Privacy Policy</Text>
        </Pressable>

        <Pressable
          style={[styles.signUpBtn, loading && { opacity: 0.7 }]}
          onPress={handleSignUp}
          disabled={loading}
          testID="sign-up-btn"
        >
          <Text style={styles.signUpBtnText}>{loading ? "Creating account..." : "Sign up"}</Text>
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
          <Text style={[styles.bottomLabel, { color: c.textMuted }]}>Already have an account? </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.bottomLink}>Sign in</Text>
          </Pressable>
        </View>

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
    alignItems: "stretch",
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
    marginBottom: 22,
  },
  avatarWrap: {
    alignSelf: "center",
    marginBottom: 6,
    position: "relative",
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  nameRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 0,
  },
  nameInput: {
    flex: 1,
    marginBottom: 14,
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
    flexShrink: 1,
  },
  signUpBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  signUpBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.white,
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
