import React, { useState, useRef } from "react";
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
} from "react-native";
import { Image } from "expo-image";
import { useSafeInsets } from "@/lib/safe-area";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useThemeColors } from "@/context/ThemeContext";

export default function CharitySignupScreen() {
  const insets = useSafeInsets();
  const c = useThemeColors();
  const { signUpCharity } = useAuth();
  const [charityName, setCharityName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
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

  async function handleSignUp() {
    if (!charityName.trim() || !firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
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
    const success = await signUpCharity({
      charityName: charityName.trim(),
      category: category.trim() || "other",
      description: description.trim(),
      url: url.trim(),
      name: `${firstName.trim()} ${lastName.trim()}`,
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (success) {
      Alert.alert(
        "Request Submitted",
        "Your charity access request has been submitted. Our team will review and contact you within 24-48 hours.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/welcome") }]
      );
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
        <View style={styles.badgeWrap}>
          <View style={styles.badge}>
            <Ionicons name="business-outline" size={20} color={Colors.green} />
            <Text style={styles.badgeText}>Charity Registration</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: c.text }]}>Request Charity Access</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>Fill in the details to get started</Text>

        <Text style={[styles.sectionLabel, { color: c.text }]}>Organization Details</Text>

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
          <Ionicons name="business-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Charity / Organization Name"
            placeholderTextColor={c.textMuted}
            value={charityName}
            onChangeText={setCharityName}
            testID="charity-name-input"
          />
        </View>

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
          <Ionicons name="grid-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Category (e.g. Education, Health)"
            placeholderTextColor={c.textMuted}
            value={category}
            onChangeText={setCategory}
            testID="category-input"
          />
        </View>

        <View style={[styles.inputWrap, styles.textArea, { backgroundColor: c.inputBg }]}>
          <TextInput
            style={[styles.input, styles.textAreaInput, { color: c.text }]}
            placeholder="Brief description of your organization"
            placeholderTextColor={c.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            testID="description-input"
          />
        </View>

        <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
          <Ionicons name="link-outline" size={20} color={c.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder="Website URL (optional)"
            placeholderTextColor={c.textMuted}
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            testID="url-input"
          />
        </View>

        <Text style={[styles.sectionLabel, { color: c.text, marginTop: 16 }]}>Contact Person</Text>

        <Pressable style={styles.avatarWrap} onPress={pickAvatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: c.inputBg, borderColor: c.border }]}>
              <Ionicons name="camera-outline" size={26} color={c.textMuted} />
            </View>
          )}
          <View style={[styles.avatarBadge, { backgroundColor: Colors.green }]}>
            <Ionicons name="add" size={14} color="#fff" />
          </View>
        </Pressable>
        <Text style={[styles.avatarHint, { color: c.textMuted }]}>
          {avatarUri ? "Tap to change photo" : "Add profile photo (optional)"}
        </Text>

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

        <Pressable style={styles.termsRow} onPress={() => setAgreedToTerms(!agreedToTerms)}>
          <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
            {agreedToTerms && <Ionicons name="checkmark" size={13} color={Colors.white} />}
          </View>
          <Text style={[styles.termsText, { color: c.text }]}>
            I agree to the{" "}
            <Text style={styles.termsLink} onPress={() => router.push("/settings/terms-of-service")}>
              Terms
            </Text>{" "}
            and{" "}
            <Text style={styles.termsLink} onPress={() => router.push("/settings/privacy-policy")}>
              Privacy Policy
            </Text>
          </Text>
        </Pressable>

        <Pressable
          style={[styles.signUpBtn, loading && { opacity: 0.7 }]}
          onPress={handleSignUp}
          disabled={loading}
          testID="submit-btn"
        >
          <Text style={styles.signUpBtnText}>{loading ? "Submitting..." : "Submit Request"}</Text>
        </Pressable>

        <View style={styles.bottomRow}>
          <Text style={[styles.bottomLabel, { color: c.textMuted }]}>Already have access? </Text>
          <Pressable onPress={() => router.push("/(auth)/charity-login")}>
            <Text style={styles.bottomLink}>Sign in</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.donorLink}
          onPress={() => router.push("/(auth)/donor-signup")}
        >
          <Ionicons name="arrow-back" size={14} color={Colors.green} />
          <Text style={styles.donorLinkText}>Donor Signup</Text>
        </Pressable>
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
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.green,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    marginBottom: 12,
  },
  avatarWrap: {
    alignSelf: "center",
    marginBottom: 6,
    position: "relative",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 14,
  },
  nameRow: {
    flexDirection: "row",
    gap: 10,
  },
  nameInput: {
    flex: 1,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 12,
  },
  textArea: {
    alignItems: "flex-start",
    paddingVertical: 14,
    minHeight: 100,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
  },
  textAreaInput: {
    minHeight: 70,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginVertical: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.green,
  },
  termsText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  termsLink: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.green,
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
  bottomRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
  },
  bottomLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  bottomLink: {
    fontFamily: "Poppins_600SemiBold",
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
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.green,
  },
});
