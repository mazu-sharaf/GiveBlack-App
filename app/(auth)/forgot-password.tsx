import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

type Step = "email" | "otp" | "reset" | "success";

export default function ForgotPasswordScreen() {
  const insets = useSafeInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = insets.bottom;
  const c = useThemeColors();
  const { requestResetCode, confirmResetPassword } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [loading, setLoading] = useState(false);

  const otpRefs = useRef<(TextInput | null)[]>([]);

  async function handleRequestCode() {
    if (!email.trim() || !email.includes("@")) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const result = await requestResetCode(email);
      if (!result.success) {
        Alert.alert(result.rateLimited ? "Too Many Requests" : "Error", result.error || "Failed to send code");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setStep("otp");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(value: string, index: number) {
    setOtpError(false);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyPress(key: string, index: number) {
    if (key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleVerifyOtp() {
    const code = otp.join("");
    if (code.length < 6) {
      setOtpError(true);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("reset");
  }

  async function handleResetPassword() {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert("Error", "Please fill in both fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(true);
      return;
    }

    setLoading(true);
    try {
      const result = await confirmResetPassword(email, otp.join(""), newPassword);
      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to reset password");
        if (result.error?.includes("expired") || result.error?.includes("Invalid")) {
          setStep("otp");
          setOtp(["", "", "", "", "", ""]);
        }
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setStep("success");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setLoading(true);
    try {
      const result = await requestResetCode(email);
      if (!result.success) {
        Alert.alert(result.rateLimited ? "Too Many Requests" : "Error", result.error || "Failed to send code");
      } else {
        Alert.alert("Code Sent", "A new verification code has been sent to your email.");
        setOtp(["", "", "", "", "", ""]);
      }
    } finally {
      setLoading(false);
    }
  }

  function getPasswordStrength(): { label: string; color: string; width: string } {
    const len = newPassword.length;
    if (len === 0) return { label: "", color: "transparent", width: "0%" };
    if (len < 4) return { label: "Weak", color: "#E74C3C", width: "25%" };
    if (len < 6) return { label: "Fair", color: "#F39C12", width: "50%" };
    if (len < 8) return { label: "Good", color: Colors.green, width: "75%" };
    return { label: "Strong", color: Colors.green, width: "100%" };
  }

  const strength = getPasswordStrength();

  function renderEmail() {
    return (
      <>
        <Text style={[styles.title, { color: c.text }]}>Forgot{"\n"}Password?</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>
          Enter the email address associated with your account and we will send you a verification code.
        </Text>

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
          <Ionicons name="mail-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Email Address"
            placeholderTextColor={c.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Pressable
          style={[styles.continueBtn, loading && styles.btnDisabled]}
          onPress={handleRequestCode}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.continueBtnText}>Send Code</Text>
          )}
        </Pressable>
      </>
    );
  }

  function renderOtp() {
    return (
      <>
        <Text style={[styles.title, { color: c.text }]}>Enter the code</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>
          We sent a 6-digit verification code to {email}. Enter it below.
        </Text>

        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => { otpRefs.current[i] = ref; }}
              style={[styles.otpBox, { backgroundColor: c.cardBg, borderColor: c.border, color: c.text }, otpError && styles.otpBoxError, digit && !otpError && styles.otpBoxFilled]}
              value={digit}
              onChangeText={(v) => handleOtpChange(v.replace(/[^0-9]/g, "").slice(-1), i)}
              onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
              testID={`otp-${i}`}
            />
          ))}
        </View>

        {otpError && (
          <Text style={styles.errorText}>Please enter the complete 6-digit code.</Text>
        )}

        <Pressable style={styles.resendBtn} onPress={handleResendCode} disabled={loading}>
          <Text style={styles.resendText}>{loading ? "Sending..." : "Get new code"}</Text>
        </Pressable>

        <Pressable style={styles.continueBtn} onPress={handleVerifyOtp}>
          <Text style={styles.continueBtnText}>Verify</Text>
        </Pressable>
      </>
    );
  }

  function renderReset() {
    return (
      <>
        <Text style={[styles.title, { color: c.text }]}>Create new{"\n"}password</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>Your new password must be different from previously used passwords.</Text>

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }, passwordError && newPassword !== confirmPassword && styles.inputError]}>
          <Ionicons name="lock-closed-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="New Password"
            placeholderTextColor={c.textMuted}
            value={newPassword}
            onChangeText={(v) => { setNewPassword(v); setPasswordError(false); }}
            secureTextEntry={!showNewPw}
          />
          <Pressable onPress={() => setShowNewPw(!showNewPw)} hitSlop={8}>
            <Ionicons name={showNewPw ? "eye-outline" : "eye-off-outline"} size={20} color={c.textMuted} />
          </Pressable>
        </View>

        {newPassword.length > 0 && (
          <View style={styles.strengthRow}>
            <View style={styles.strengthTrack}>
              <View style={[styles.strengthFill, { width: strength.width as `${number}%`, backgroundColor: strength.color }]} />
            </View>
            <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
          </View>
        )}

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }, passwordError && styles.inputError]}>
          <Ionicons name="lock-closed-outline" size={20} color={passwordError ? "#E74C3C" : c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Confirm Password"
            placeholderTextColor={c.textMuted}
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); setPasswordError(false); }}
            secureTextEntry={!showConfirmPw}
          />
          <Pressable onPress={() => setShowConfirmPw(!showConfirmPw)} hitSlop={8}>
            <Ionicons name={showConfirmPw ? "eye-outline" : "eye-off-outline"} size={20} color={c.textMuted} />
          </Pressable>
        </View>

        {passwordError && (
          <Text style={styles.errorText}>Passwords don't match</Text>
        )}

        <Pressable
          style={[styles.continueBtn, loading && styles.btnDisabled]}
          onPress={handleResetPassword}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.continueBtnText}>Reset Password</Text>
          )}
        </Pressable>
      </>
    );
  }

  useEffect(() => {
    if (step === "success") {
      const timer = setTimeout(() => {
        router.replace("/(auth)/donor-login");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  function renderSuccess() {
    return (
      <View style={styles.successWrap}>
        <View style={styles.confettiArea}>
          <View style={[styles.confettiDot, { top: 20, left: 30, backgroundColor: Colors.gold }]} />
          <View style={[styles.confettiDot, { top: 40, right: 50, backgroundColor: Colors.green }]} />
          <View style={[styles.confettiDot, { top: 80, left: 60, backgroundColor: "#E74C3C" }]} />
          <View style={[styles.confettiDot, { top: 10, right: 30, backgroundColor: "#3498DB" }]} />
          <View style={[styles.confettiRect, { top: 50, left: 20, backgroundColor: Colors.green }]} />
          <View style={[styles.confettiRect, { top: 30, right: 40, backgroundColor: Colors.gold }]} />
          <View style={[styles.confettiDot, { top: 70, right: 20, backgroundColor: "#E74C3C" }]} />
          <View style={[styles.confettiRect, { top: 60, left: 80, backgroundColor: "#3498DB" }]} />
        </View>

        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={48} color={Colors.white} />
        </View>

        <Text style={[styles.successTitle, { color: c.text }]}>Congratulations</Text>
        <Text style={[styles.successSubtitle, { color: c.textMuted }]}>Your password has been reset successfully. You will be redirected to the login page shortly.</Text>

        <Pressable style={styles.continueBtn} onPress={() => router.replace("/(auth)/donor-login")}>
          <Text style={styles.continueBtnText}>Back to Login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.outerContainer, { backgroundColor: c.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {step !== "success" && (
        <View style={[styles.header, { backgroundColor: c.background, paddingTop: topPad + 10 }]}>
          <Pressable
            style={[styles.backBtn, { borderColor: c.border }]}
            onPress={() => {
              if (step === "email") router.back();
              else if (step === "otp") setStep("email");
              else if (step === "reset") setStep("otp");
            }}
          >
            <Ionicons name="arrow-back" size={22} color={c.text} />
          </Pressable>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: step === "success" ? topPad + 10 : 0,
            paddingBottom: bottomPad + 80,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
      >
        {step === "email" && renderEmail()}
        {step === "otp" && renderOtp()}
        {step === "reset" && renderReset()}
        {step === "success" && renderSuccess()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
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
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 22,
    marginBottom: 28,
  },
  continueBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  continueBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  otpBox: {
    width: 50,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.primary,
    textAlign: "center",
  },
  otpBoxFilled: {
    borderColor: Colors.green,
  },
  otpBoxError: {
    borderColor: "#E74C3C",
    backgroundColor: "#E74C3C10",
  },
  errorText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#E74C3C",
    textAlign: "center",
    marginBottom: 8,
  },
  resendBtn: {
    alignSelf: "center",
    marginBottom: 8,
  },
  resendText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
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
  inputError: {
    borderWidth: 1.5,
    borderColor: "#E74C3C",
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
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  strengthTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    overflow: "hidden",
  },
  strengthFill: {
    height: "100%",
    borderRadius: 2,
  },
  strengthLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    minWidth: 40,
  },
  successWrap: {
    alignItems: "center",
    paddingTop: 40,
  },
  confettiArea: {
    width: "100%",
    height: 100,
    position: "relative",
    marginBottom: 10,
  },
  confettiDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confettiRect: {
    position: "absolute",
    width: 6,
    height: 14,
    borderRadius: 2,
    transform: [{ rotate: "30deg" }],
  },
  successCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  successTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.primary,
    marginBottom: 12,
  },
  successSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
});
