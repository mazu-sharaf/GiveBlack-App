import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  Platform,
  Linking,
  Share,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { APP_VERSION } from "@/constants/version";
import { apiPost, apiGet, apiPatch, getApiUrl } from "@/lib/query-client";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import AppHeader from "@/components/AppHeader";
import GuestLockSheet from "@/components/GuestLockSheet";


function SettingRow({
  icon,
  label,
  description,
  right,
  onPress,
}: {
  icon: string;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress && !right}>
      <View style={[styles.rowIcon, { backgroundColor: c.background }]}>
        <Ionicons name={icon as any} size={18} color={c.text} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
        {description && <Text style={[styles.rowDesc, { color: c.textMuted }]}>{description}</Text>}
      </View>
      {right || (onPress && <Ionicons name="chevron-forward" size={16} color={c.textLight} />)}
    </Pressable>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: c.cardBg }]}>{children}</View>
    </View>
  );
}

type NotifPrefs = {
  donor_receipts: boolean;
  org_donations: boolean;
  org_volunteers: boolean;
  org_campaign_status: boolean;
  org_subscription: boolean;
  donor_new_campaigns_from_orgs_i_supported: boolean;
  new_campaigns: boolean;
};

function NotificationsPage() {
  const c = useThemeColors();
  const { session, user } = useAuth();
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<"granted" | "denied" | "undetermined" | null>(null);

  const checkPermission = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const Notif = require("expo-notifications") as typeof import("expo-notifications");
      const { status } = await Notif.getPermissionsAsync();
      setPermissionStatus(status);
    } catch {
      // expo-notifications unavailable in this environment
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const Notif = require("expo-notifications") as typeof import("expo-notifications");
      const { status } = await Notif.requestPermissionsAsync();
      setPermissionStatus(status);
    } catch {
      // expo-notifications unavailable in this environment
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission])
  );

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<{ preferences: NotifPrefs }>(
          "/api/me/notification-settings",
          session.accessToken
        );
        if (!cancelled && data.preferences) setPrefs(data.preferences);
      } catch {
        if (!cancelled) setPrefs(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  async function patchPref(key: keyof NotifPrefs, value: boolean) {
    if (!session?.accessToken || !prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      const res = await apiPatch<{ preferences: NotifPrefs }>(
        "/api/me/notification-settings",
        { [key]: value },
        session.accessToken
      );
      if (res.preferences) setPrefs(res.preferences);
      if (value && permissionStatus === "granted") {
        const { registerPushTokenWithAuth } = await import("@/lib/notifications");
        void registerPushTokenWithAuth(session.accessToken);
      }
    } catch {
      setPrefs(prefs);
    }
  }

  const isCharity = user?.type === "charity";

  return (
    <>
      <InfoSection title="Push notifications">
        {permissionStatus === "undetermined" && (
          <Pressable
            onPress={() => void requestPermission()}
            style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: c.border }}
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.text }]}>Enable push notifications</Text>
              <Text style={[styles.rowDesc, { color: c.textMuted }]}>
                Tap to allow GiveBlack to send you push notifications
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textLight} />
          </Pressable>
        )}
        {permissionStatus === "denied" && (
          <Pressable
            onPress={() => Linking.openSettings()}
            style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: c.border }}
          >
            <Ionicons name="warning-outline" size={20} color={c.warningAmber} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.text }]}>Notifications are blocked</Text>
              <Text style={[styles.rowDesc, { color: c.textMuted }]}>
                Tap to open System Settings and allow notifications for GiveBlack
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textLight} />
          </Pressable>
        )}
        {loading || !prefs ? (
          <Text style={[styles.legalText, { color: c.textMuted, padding: 16 }]}>
            {session?.accessToken ? "Loading…" : "Sign in to manage notification preferences."}
          </Text>
        ) : (
          <>
            {user?.type === "donor" && (
              <>
                <SettingRow
                  icon="heart-outline"
                  label="Donation confirmations"
                  description="When your donation is successfully processed"
                  right={
                    <Switch
                      value={prefs.donor_receipts}
                      onValueChange={(v) => void patchPref("donor_receipts", v)}
                      trackColor={{ true: Colors.green }}
                    />
                  }
                />
                <View style={[styles.sep, { backgroundColor: c.border }]} />
                <SettingRow
                  icon="megaphone-outline"
                  label="New campaigns from orgs you supported"
                  description="When a charity you gave to launches a campaign"
                  right={
                    <Switch
                      value={prefs.donor_new_campaigns_from_orgs_i_supported}
                      onValueChange={(v) => void patchPref("donor_new_campaigns_from_orgs_i_supported", v)}
                      trackColor={{ true: Colors.green }}
                    />
                  }
                />
                <View style={[styles.sep, { backgroundColor: c.border }]} />
                <SettingRow
                  icon="notifications-outline"
                  label="All new campaigns on GiveBlack"
                  description="Be the first to know whenever any new campaign launches"
                  right={
                    <Switch
                      value={prefs.new_campaigns ?? true}
                      onValueChange={(v) => void patchPref("new_campaigns", v)}
                      trackColor={{ true: Colors.green }}
                    />
                  }
                />
              </>
            )}
            {isCharity && (
              <>
                <SettingRow
                  icon="cash-outline"
                  label="New donations"
                  description="When someone donates to your campaigns"
                  right={
                    <Switch
                      value={prefs.org_donations}
                      onValueChange={(v) => void patchPref("org_donations", v)}
                      trackColor={{ true: Colors.green }}
                    />
                  }
                />
                <View style={[styles.sep, { backgroundColor: c.border }]} />
                <SettingRow
                  icon="hand-left-outline"
                  label="Volunteer signups"
                  description="When someone applies to volunteer"
                  right={
                    <Switch
                      value={prefs.org_volunteers}
                      onValueChange={(v) => void patchPref("org_volunteers", v)}
                      trackColor={{ true: Colors.green }}
                    />
                  }
                />
                <View style={[styles.sep, { backgroundColor: c.border }]} />
                <SettingRow
                  icon="rocket-outline"
                  label="Campaign status"
                  description="When your campaign goes live on GiveBlack"
                  right={
                    <Switch
                      value={prefs.org_campaign_status}
                      onValueChange={(v) => void patchPref("org_campaign_status", v)}
                      trackColor={{ true: Colors.green }}
                    />
                  }
                />
                <View style={[styles.sep, { backgroundColor: c.border }]} />
                <SettingRow
                  icon="trending-up-outline"
                  label="Plan & subscription"
                  description="When your organization upgrades to a higher plan"
                  right={
                    <Switch
                      value={prefs.org_subscription}
                      onValueChange={(v) => void patchPref("org_subscription", v)}
                      trackColor={{ true: Colors.green }}
                    />
                  }
                />
              </>
            )}
            {!isCharity && user?.type !== "donor" && (
              <Text style={[styles.legalText, { color: c.textMuted, padding: 16 }]}>
                Notification categories are available for donor and charity accounts.
              </Text>
            )}
          </>
        )}
      </InfoSection>
      <InfoSection title="Email (local)">
        <SettingRow
          icon="mail-outline"
          label="Email notifications"
          description="Preference for email is stored on this device only"
          right={<Switch value={emailEnabled} onValueChange={setEmailEnabled} trackColor={{ true: Colors.green }} />}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="calendar-outline"
          label="Weekly giving digest"
          description="Local reminder preference"
          right={<Switch value={weeklyDigest} onValueChange={setWeeklyDigest} trackColor={{ true: Colors.green }} />}
        />
      </InfoSection>
    </>
  );
}

function PrivacyPage() {
  const c = useThemeColors();
  const { user, session, logout, requestResetCode } = useAuth();
  const { userProfile, updateProfile, setPinHash } = useApp();
  const [profileVisible, setProfileVisible] = useState(true);
  const [showDonations, setShowDonations] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState("Biometric");
  const [changePinMode, setChangePinMode] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  React.useEffect(() => {
    checkBiometric();
  }, []);

  async function checkBiometric() {
    if (Platform.OS === "web") return;
    try {
      const LocalAuth = require("expo-local-authentication");
      const hasHw = await LocalAuth.hasHardwareAsync();
      const isEnrolled = await LocalAuth.isEnrolledAsync();
      setBiometricAvailable(hasHw && isEnrolled);
      const types = await LocalAuth.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("Face ID");
      } else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
        setBiometricType("Fingerprint");
      }
    } catch (e) {
      setBiometricAvailable(false);
    }
  }

  async function handleBiometricToggle(value: boolean) {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Biometric authentication is only available on mobile devices.");
      return;
    }
    if (value) {
      try {
        const LocalAuth = require("expo-local-authentication");
        const result = await LocalAuth.authenticateAsync({ promptMessage: "Verify your identity to enable biometric login" });
        if (result.success) {
          updateProfile({ biometricEnabled: true });
          Alert.alert("Enabled", `${biometricType} login has been enabled.`);
        }
      } catch (e) {
        Alert.alert("Error", "Biometric authentication failed.");
      }
    } else {
      updateProfile({ biometricEnabled: false });
    }
  }

  async function handleChangePassword() {
    if (user?.email) {
      const result = await requestResetCode(user.email);
      if (result.success) {
        Alert.alert("Email Sent", "A password reset code has been sent to your email address.");
      } else {
        Alert.alert("Error", result.error || "Failed to send reset code");
      }
    }
  }

  async function handleSavePin() {
    if (newPin.length !== 5) {
      Alert.alert("Error", "PIN must be 5 digits");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("Error", "PINs do not match");
      return;
    }
    await setPinHash(newPin);
    setChangePinMode(false);
    setNewPin("");
    setConfirmPin("");
    Alert.alert("Success", "Your PIN has been updated.");
  }

  async function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "Are you sure? This action cannot be undone. All your data including donation history, wallet balance, and saved cards will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const apiBase = getApiUrl().replace(/\/$/, "");
              const headers: Record<string, string> = { "Content-Type": "application/json" };
              if (session?.accessToken) headers["Authorization"] = `Bearer ${session.accessToken}`;
              await fetch(`${apiBase}/api/auth/delete-account`, {
                method: "POST",
                headers,
              });
              await logout();
              Alert.alert("Account Deleted", "Your account and all associated data have been deleted.");
            } catch (e) {
              Alert.alert("Error", "Failed to delete account. Please contact support@giveblack.org");
            }
            setDeletingAccount(false);
          },
        },
      ]
    );
  }

  async function handleExportData() {
    if (!user?.id || !session?.accessToken) {
      Alert.alert("Error", "Please log in to export your data.");
      return;
    }
    try {
      const apiBase = getApiUrl().replace(/\/$/, "");
      const response = await fetch(`${apiBase}/api/auth/export-data/${user.id}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        const txCount = data.transactions?.length || 0;
        const donCount = data.donations?.length || 0;
        const cardCount = data.savedCards?.length || 0;
        Alert.alert(
          "Data Export Ready",
          `Your data includes:\n- Profile information\n- ${txCount} transactions\n- ${donCount} donations\n- ${cardCount} saved cards\n- Wallet balance: $${data.wallet?.balance || 0}\n\nExported at: ${new Date(data.exportedAt).toLocaleString()}`
        );
      } else {
        Alert.alert("Error", "Failed to export data. Please try again or contact support@giveblack.org");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to export data. Please try again or contact support@giveblack.org");
    }
  }

  return (
    <>
      <InfoSection title="Profile Privacy">
        <SettingRow
          icon="eye-outline"
          label="Profile Visibility"
          description="Allow other donors to see your profile"
          right={<Switch value={profileVisible} onValueChange={setProfileVisible} trackColor={{ true: Colors.green }} />}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="heart-outline"
          label="Show Donation History"
          description="Display your donations publicly"
          right={<Switch value={showDonations} onValueChange={setShowDonations} trackColor={{ true: Colors.green }} />}
        />
      </InfoSection>
      <InfoSection title="Security">
        <SettingRow
          icon="lock-closed-outline"
          label="Change Password"
          description="Send a password reset link to your email"
          onPress={handleChangePassword}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="finger-print-outline"
          label={`${biometricType} Login`}
          description={biometricAvailable
            ? `Use ${biometricType} to sign in and confirm payments`
            : Platform.OS === "web" ? "Available on mobile devices only" : "Not available on this device"
          }
          right={
            <Switch
              value={userProfile.biometricEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ true: Colors.green }}
              disabled={!biometricAvailable && Platform.OS !== "web"}
            />
          }
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="keypad-outline"
          label={userProfile.pinHash ? "Change PIN" : "Set Up PIN"}
          description={userProfile.pinHash ? "Update your 5-digit security PIN" : "Create a 5-digit PIN for payment confirmations"}
          onPress={() => setChangePinMode(!changePinMode)}
        />
        {changePinMode && (
          <View style={s2.pinSection}>
            <TextInput
              style={[s2.pinInput, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
              placeholder="Enter new 5-digit PIN"
              placeholderTextColor={c.textMuted}
              value={newPin}
              onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, "").slice(0, 5))}
              keyboardType="number-pad"
              maxLength={5}
              secureTextEntry
            />
            <TextInput
              style={[s2.pinInput, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
              placeholder="Confirm PIN"
              placeholderTextColor={c.textMuted}
              value={confirmPin}
              onChangeText={(t) => setConfirmPin(t.replace(/[^0-9]/g, "").slice(0, 5))}
              keyboardType="number-pad"
              maxLength={5}
              secureTextEntry
            />
            <Pressable style={s2.pinSaveBtn} onPress={handleSavePin}>
              <Text style={s2.pinSaveBtnText}>Save PIN</Text>
            </Pressable>
          </View>
        )}
      </InfoSection>
      <InfoSection title="Data">
        <SettingRow
          icon="analytics-outline"
          label="Analytics & Usage Data"
          description="Help us improve with anonymous usage data"
          right={<Switch value={analyticsEnabled} onValueChange={setAnalyticsEnabled} trackColor={{ true: Colors.green }} />}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="download-outline"
          label="Download My Data"
          description="Export a copy of all your personal data (GDPR/CCPA)"
          onPress={handleExportData}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="trash-outline"
          label="Delete Account"
          description="Permanently delete your account and all data"
          onPress={handleDeleteAccount}
        />
      </InfoSection>
    </>
  );
}

function HelpPage() {
  const c = useThemeColors();
  return (
    <>
      <InfoSection title="Get Help">
        <SettingRow
          icon="chatbubble-ellipses-outline"
          label="Contact Support"
          description="Email us at support@giveblack.org"
          onPress={() => Linking.openURL("mailto:support@giveblack.org")}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="call-outline"
          label="Call Us"
          description="(832) 555-0199 · Mon-Fri 9AM-5PM CST"
          onPress={() => Linking.openURL("tel:8325550199")}
        />
      </InfoSection>
      <InfoSection title="Frequently Asked Questions">
        <FAQItem
          question="How do I make a donation?"
          answer="Navigate to the Give tab, browse organizations by category, select an organization, choose your donation amount, and confirm. Your donation is processed securely."
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <FAQItem
          question="Is my donation tax-deductible?"
          answer="All organizations on GiveBlack are verified 501(c)(3) nonprofits. You will receive a donation receipt via email that can be used for tax purposes."
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <FAQItem
          question="How do I track my donations?"
          answer="Visit your Profile tab to see your complete donation history, including amounts, dates, and the organizations you've supported."
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <FAQItem
          question="Can I set up recurring donations?"
          answer="Recurring donations will be available in a future update. Currently, all donations are one-time gifts."
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <FAQItem
          question="How are charities verified?"
          answer="Every charity undergoes a thorough vetting process. Our team verifies their 501(c)(3) status, bank information, and organizational mission before they appear on the platform."
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <FAQItem
          question="How do I get a refund?"
          answer="Please contact support at support@giveblack.org within 48 hours of your donation. Refunds are processed on a case-by-case basis."
        />
      </InfoSection>
      <InfoSection title="Resources">
        <SettingRow
          icon="book-outline"
          label="About GiveBlack"
          description="Learn more about our mission"
          onPress={() => Alert.alert("About GiveBlack", "GiveBlack is the world's go-to app for Black Philanthropy. We connect donors with verified Black-led and Black-serving organizations to make giving easy, transparent, and impactful.\n\nCreated for us, by us.\n\nVersion " + APP_VERSION)}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="people-outline"
          label="Community Guidelines"
          description="Our standards for the GiveBlack community"
          onPress={() => Alert.alert("Community Guidelines", "1. Be respectful and supportive\n2. Only share accurate information\n3. Protect your personal data\n4. Report any suspicious activity\n5. Celebrate and uplift our community")}
        />
      </InfoSection>
    </>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [expanded, setExpanded] = useState(false);
  const c = useThemeColors();
  return (
    <Pressable style={styles.faqRow} onPress={() => setExpanded(!expanded)}>
      <View style={styles.faqHeader}>
        <Text style={[styles.faqQuestion, { color: c.text }]}>{question}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={c.textLight} />
      </View>
      {expanded && <Text style={[styles.faqAnswer, { color: c.textMuted }]}>{answer}</Text>}
    </Pressable>
  );
}

function TermsPage() {
  const c = useThemeColors();
  return (
    <>
      <InfoSection title="Terms of Service">
        <View style={styles.legalContent}>
          <Text style={[styles.legalDate, { color: c.textLight }]}>Last Updated: February 1, 2026</Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>1. Acceptance of Terms</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            By accessing or using the GiveBlack application ("App"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the App.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>2. Description of Service</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack is a mobile platform that connects donors with verified Black-led and Black-serving nonprofit organizations. The App facilitates charitable donations and provides information about eligible organizations.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>3. User Accounts</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            You are responsible for maintaining the confidentiality of your account credentials. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>4. Donations</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            All donations made through GiveBlack are voluntary and non-refundable unless otherwise stated. Donations are directed to the selected organization after processing. GiveBlack does not charge donors any platform fees.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>5. Organization Verification</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack verifies that listed organizations are registered 501(c)(3) nonprofits. However, GiveBlack does not guarantee the actions or outcomes of any organization and is not responsible for how donations are utilized.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>6. Privacy</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            Your use of the App is also governed by our Privacy Policy. We collect and use your information as described therein. We do not sell your personal data to third parties.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>7. Intellectual Property</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            All content, trademarks, and intellectual property within the App are owned by GiveBlack or its licensors. You may not reproduce, distribute, or create derivative works without prior written consent.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>8. Limitation of Liability</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the App. Our total liability shall not exceed the amount of your most recent donation.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>9. Termination</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We reserve the right to suspend or terminate your account at any time for violation of these Terms. You may delete your account at any time through the Privacy & Security settings.
          </Text>
          <Text style={[styles.legalHeading, { color: c.text }]}>10. Contact</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            For questions about these Terms, contact us at support@giveblack.org or call (832) 555-0199.
          </Text>
        </View>
      </InfoSection>
    </>
  );
}

function PrivacyPolicyPage() {
  const c = useThemeColors();
  return (
    <>
      <InfoSection title="Privacy Policy">
        <View style={styles.legalContent}>
          <Text style={[styles.legalDate, { color: c.textLight }]}>Last Updated: February 1, 2026</Text>

          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack ("we," "our," or "us") is committed to protecting the privacy of our users. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the GiveBlack mobile application and related services (collectively, the "App"). Please read this policy carefully. By using the App, you consent to the practices described herein.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>1. Information We Collect</Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>a. Information You Provide</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            When you create an account, we collect your full name, email address, zip code, and password. If you register as a charity or nonprofit organization, we also collect your organization name, category, description, website URL, and banking information (routing number, account number, bank name) for the purpose of processing donation disbursements.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>b. Donation Information</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            When you make a donation, we collect transaction details including the donation amount, selected organization, date and time, and payment method. Tax receipts are generated and stored for your records.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>c. Automatically Collected Information</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We automatically collect certain device and usage information, including device type, operating system, unique device identifiers, IP address, browser type, app usage patterns, and crash reports. This information helps us improve the App experience and diagnose technical issues.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>d. Location Information</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            With your consent, we may collect approximate location information based on your zip code to show you locally relevant organizations and causes. We do not track your precise GPS location.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>2. How We Use Your Information</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We use the information we collect for the following purposes:{"\n\n"}
            - To create and manage your account{"\n"}
            - To process and facilitate charitable donations{"\n"}
            - To verify and onboard nonprofit organizations{"\n"}
            - To generate tax receipts and donation summaries{"\n"}
            - To send transaction confirmations and impact updates{"\n"}
            - To provide customer support and respond to inquiries{"\n"}
            - To personalize your experience and recommend organizations{"\n"}
            - To improve, maintain, and optimize the App{"\n"}
            - To detect and prevent fraud, abuse, or unauthorized access{"\n"}
            - To comply with legal obligations and enforce our Terms of Service
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>3. Information Sharing and Disclosure</Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>a. We Do Not Sell Your Data</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack does not sell, rent, or trade your personal information to third parties for marketing purposes. Your trust is fundamental to our mission.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>b. Organizations You Support</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            When you make a donation, the receiving organization may receive your name and email address so they can acknowledge your contribution and provide impact updates. You can opt out of this sharing in your Privacy & Security settings.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>c. Service Providers</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We share information with trusted third-party service providers who assist us in operating the App:{"\n\n"}
            - Stripe: Payment processing (PCI DSS Level 1 compliant). Card details are tokenized by Stripe and never stored on our servers.{"\n"}
            - PostgreSQL: Database services. Your data is encrypted at rest and in transit.{"\n"}
            - Expo: Push notification delivery. Your device token is used solely for notification delivery.{"\n\n"}
            These providers are contractually obligated to protect your information and use it only for the services they provide to us.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>d. Legal Requirements</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We may disclose your information if required by law, regulation, legal process, or governmental request, or when we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>4. Data Security</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We implement industry-standard security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. This includes encryption of data in transit (TLS/SSL) and at rest, secure payment processing through PCI-compliant providers, regular security audits, and access controls limiting employee access to personal data on a need-to-know basis. While we strive to protect your information, no method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>5. Data Retention</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We retain your personal information for as long as your account is active or as needed to provide services, comply with legal obligations, resolve disputes, and enforce our agreements. Donation records are retained for a minimum of seven (7) years for tax compliance purposes. If you delete your account, we will remove your personal information within 30 days, except where retention is required by law.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>6. Your Rights and Choices</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            You have the following rights regarding your personal information:{"\n\n"}
            - Access: Request a copy of the personal data we hold about you{"\n"}
            - Correction: Update or correct inaccurate personal information{"\n"}
            - Deletion: Request deletion of your personal data, subject to legal retention requirements{"\n"}
            - Portability: Request your data in a portable, machine-readable format{"\n"}
            - Opt-out: Unsubscribe from marketing communications at any time{"\n"}
            - Restrict Processing: Request that we limit how we use your data{"\n\n"}
            To exercise any of these rights, visit your Privacy & Security settings in the App or contact us at support@giveblack.org.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>7. Children's Privacy</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack is not intended for use by individuals under the age of 13. We do not knowingly collect personal information from children under 13. If we learn that we have collected information from a child under 13, we will promptly delete it. If you believe a child has provided us with personal information, please contact us immediately.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>8. Third-Party Links</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            The App may contain links to third-party websites, including the websites of nonprofit organizations. We are not responsible for the privacy practices or content of these external sites. We encourage you to review the privacy policies of any third-party services you access through the App.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>9. Push Notifications</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            With your consent, we may send push notifications to inform you about donation confirmations, impact updates, new organizations, and other relevant information. You can manage your notification preferences in the App settings or through your device settings at any time.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>10. Changes to This Privacy Policy</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy in the App and updating the "Last Updated" date. Your continued use of the App after changes are posted constitutes your acceptance of the revised policy. We encourage you to review this policy periodically.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>11. Contact Us</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:{"\n\n"}
            GiveBlack Support{"\n"}
            Email: support@giveblack.org{"\n"}
            Phone: (832) 555-0199{"\n\n"}
            We will respond to your inquiry within 30 business days.
          </Text>
        </View>
      </InfoSection>
    </>
  );
}

function TermsOfServicePage() {
  const c = useThemeColors();
  return (
    <>
      <InfoSection title="Terms of Service">
        <View style={styles.legalContent}>
          <Text style={[styles.legalDate, { color: c.textLight }]}>Last Updated: February 1, 2026</Text>

          <Text style={[styles.legalText, { color: c.textMuted }]}>
            Welcome to GiveBlack. These Terms of Service ("Terms") govern your access to and use of the GiveBlack mobile application and related services (collectively, the "App"). By creating an account or using the App, you agree to be bound by these Terms. If you do not agree, please do not use the App.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>1. Eligibility</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            You must be at least 18 years old (or the age of majority in your jurisdiction) to create an account and use the App. By using the App, you represent and warrant that you meet these eligibility requirements and have the legal capacity to enter into these Terms.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>2. Description of Service</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack is a mobile platform dedicated to Black philanthropy. The App connects donors with verified Black-led and Black-serving nonprofit organizations, facilitates charitable donations, and provides tools for organizations to manage their fundraising efforts. GiveBlack acts as a technology intermediary and is not itself a charity, financial institution, or payment processor.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>3. User Accounts</Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>a. Registration</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            To use certain features of the App, you must create an account by providing accurate, current, and complete information. You may register as a Donor or as an Organization. Organization accounts are subject to an additional verification and approval process.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>b. Account Security</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account. GiveBlack is not liable for any loss or damage resulting from unauthorized access to your account.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>c. Account Accuracy</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            You agree to keep your account information accurate and up to date. Providing false or misleading information may result in suspension or termination of your account.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>4. Donations</Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>a. Voluntary Contributions</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            All donations made through GiveBlack are voluntary charitable contributions. By making a donation, you authorize us to process the payment and direct the funds to the selected organization.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>b. No Refunds</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            Donations are generally non-refundable once processed. In exceptional circumstances (such as duplicate charges or processing errors), you may request a refund by contacting support@giveblack.org within 14 days of the transaction.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>c. Platform Fees and Payment Processing</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack does not charge donors any platform fees. 100% of your donation amount is directed to the selected organization's bank account via secure direct transfer. Payments are processed by Stripe, a PCI DSS Level 1 compliant payment processor. Your card details are tokenized by Stripe and never stored on GiveBlack servers. Standard payment processing fees charged by Stripe may apply and are borne by the receiving organization.
          </Text>

          <Text style={[styles.legalSubheading, { color: c.text }]}>d. Tax Receipts</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack provides donation receipts for your records. However, GiveBlack does not provide tax advice. Consult a qualified tax professional to determine the tax deductibility of your donations. The receiving organization is responsible for providing any required tax documentation (such as IRS Form 990).
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>5. Organization Verification</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            GiveBlack conducts a verification process for organizations that wish to receive donations through the App. We verify that organizations are registered 501(c)(3) nonprofits or equivalent entities. However, GiveBlack does not guarantee the actions, financial management, or outcomes of any listed organization. Donors are encouraged to conduct their own research before making contributions.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>6. Organization Responsibilities</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            Organizations listed on GiveBlack agree to:{"\n\n"}
            - Maintain their tax-exempt status and provide documentation upon request{"\n"}
            - Use donated funds in accordance with their stated mission and applicable laws{"\n"}
            - Provide accurate and truthful information about their organization{"\n"}
            - Respond to donor inquiries in a timely manner{"\n"}
            - Comply with all applicable local, state, and federal regulations{"\n"}
            - Notify GiveBlack of any material changes to their status or operations
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>7. Prohibited Conduct</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            You agree not to:{"\n\n"}
            - Use the App for any unlawful purpose or in violation of any applicable laws{"\n"}
            - Impersonate any person or entity or misrepresent your affiliation{"\n"}
            - Submit false, misleading, or fraudulent information{"\n"}
            - Attempt to gain unauthorized access to other users' accounts or our systems{"\n"}
            - Interfere with or disrupt the App or its underlying infrastructure{"\n"}
            - Use automated tools, bots, or scrapers to access the App{"\n"}
            - Engage in any activity that could harm GiveBlack, its users, or listed organizations{"\n"}
            - Use the App to launder money or finance illegal activities
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>8. Intellectual Property</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            All content, trademarks, logos, service marks, trade names, and other intellectual property displayed in the App are the property of GiveBlack or its licensors. You may not copy, reproduce, distribute, modify, create derivative works of, publicly display, or otherwise use any content from the App without prior written consent from GiveBlack.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>9. User Content</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            If you submit any content to the App (such as organization descriptions, images, or reviews), you grant GiveBlack a non-exclusive, worldwide, royalty-free license to use, reproduce, modify, and display such content in connection with the App and our marketing efforts. You represent that you have the right to grant this license and that your content does not infringe any third-party rights.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>10. Disclaimer of Warranties</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY. GIVEBLACK DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>11. Limitation of Liability</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, GIVEBLACK AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF THE APP, REGARDLESS OF THE THEORY OF LIABILITY. OUR TOTAL LIABILITY SHALL NOT EXCEED THE GREATER OF $100 OR THE AMOUNT OF YOUR MOST RECENT DONATION THROUGH THE APP.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>12. Indemnification</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            You agree to indemnify, defend, and hold harmless GiveBlack and its affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising from your use of the App, your violation of these Terms, or your violation of any third-party rights.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>13. Modifications to Terms</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We reserve the right to modify these Terms at any time. We will provide notice of material changes by posting the updated Terms in the App and updating the "Last Updated" date. Your continued use of the App after changes are posted constitutes acceptance of the revised Terms. If you do not agree to the updated Terms, you must stop using the App.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>14. Termination</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            We reserve the right to suspend or terminate your account at any time, with or without cause, and with or without notice, for conduct that we determine violates these Terms or is harmful to other users, organizations, GiveBlack, or third parties. You may delete your account at any time through the Privacy & Security settings. Upon termination, your right to use the App ceases immediately.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>15. Governing Law</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            These Terms shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law provisions. Any legal action or proceeding arising from these Terms shall be brought exclusively in the state or federal courts located in Harris County, Texas.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>16. Dispute Resolution</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            Any dispute arising from or relating to these Terms or the App shall first be attempted to be resolved through good-faith negotiation. If the dispute cannot be resolved informally within 30 days, either party may initiate binding arbitration administered by the American Arbitration Association in Houston, Texas.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>17. Severability</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>18. Entire Agreement</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            These Terms, together with our Privacy Policy, constitute the entire agreement between you and GiveBlack regarding the use of the App and supersede all prior agreements, understandings, and communications.
          </Text>

          <Text style={[styles.legalHeading, { color: c.text }]}>19. Contact</Text>
          <Text style={[styles.legalText, { color: c.textMuted }]}>
            For questions about these Terms of Service, please contact us:{"\n\n"}
            GiveBlack Support{"\n"}
            Email: support@giveblack.org{"\n"}
            Phone: (832) 555-0199{"\n\n"}
            We are here to help and will respond within 30 business days.
          </Text>
        </View>
      </InfoSection>
    </>
  );
}

function SharePage() {
  const c = useThemeColors();
  const handleShare = async () => {
    try {
      await Share.share({
        message: "Join me on GiveBlack, the world's go-to app for Black Philanthropy! Download now and make a difference. https://giveblack.org",
        title: "Share GiveBlack",
      });
    } catch (e) {}
  };

  return (
    <>
      <View style={styles.shareHero}>
        <View style={[styles.shareIconWrap, { backgroundColor: c.gold + "18" }]}>
          <Ionicons name="heart" size={48} color={c.gold} />
        </View>
        <Text style={[styles.shareTitle, { color: c.text }]}>Spread the Word</Text>
        <Text style={[styles.shareSubtitle, { color: c.textMuted }]}>
          Help grow the GiveBlack community by sharing with friends and family. Together, we can make a bigger impact.
        </Text>
      </View>
      <InfoSection title="Share Options">
        <SettingRow
          icon="share-social-outline"
          label="Share via..."
          description="Share GiveBlack using your preferred app"
          onPress={handleShare}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="copy-outline"
          label="Copy Link"
          description="Copy the download link to clipboard"
          onPress={async () => {
            try {
              if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
                await navigator.clipboard.writeText("https://giveblack.org");
              }
              Alert.alert("Link Copied", "The GiveBlack download link has been copied to your clipboard.");
            } catch { Alert.alert("Link Copied", "https://giveblack.org"); }
          }}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="mail-outline"
          label="Invite via Email"
          description="Send an email invitation"
          onPress={() => Linking.openURL("mailto:?subject=Join%20GiveBlack&body=Join%20me%20on%20GiveBlack%20%E2%80%94%20the%20world%27s%20go-to%20app%20for%20Black%20Philanthropy!%20Download%20now%20at%20https%3A%2F%2Fgiveblack.org")}
        />
      </InfoSection>
      <InfoSection title="Impact So Far">
        <View style={styles.impactGrid}>
          <View style={[styles.impactItem, { backgroundColor: c.background }]}>
            <Text style={[styles.impactValue, { color: c.green }]}>10,000+</Text>
            <Text style={[styles.impactLabel, { color: c.textMuted }]}>Active Donors</Text>
          </View>
          <View style={[styles.impactItem, { backgroundColor: c.background }]}>
            <Text style={[styles.impactValue, { color: c.green }]}>500+</Text>
            <Text style={[styles.impactLabel, { color: c.textMuted }]}>Organizations</Text>
          </View>
          <View style={[styles.impactItem, { backgroundColor: c.background }]}>
            <Text style={[styles.impactValue, { color: c.green }]}>$2M+</Text>
            <Text style={[styles.impactLabel, { color: c.textMuted }]}>Raised</Text>
          </View>
        </View>
      </InfoSection>
    </>
  );
}

function EditProfilePage() {
  const c = useThemeColors();
  const { userProfile, updateProfile } = useApp();
  const { avatarUrl, session, fetchWithAuth, setAvatarUrl } = useAuth();
  const [fullName, setFullName] = useState(String(userProfile.fullName ?? ""));
  const [nickname, setNickname] = useState(String(userProfile.nickname ?? ""));
  const [phone, setPhone] = useState(String(userProfile.phone ?? ""));
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(avatarUrl || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!fullName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    updateProfile({ fullName: fullName.trim(), nickname: nickname.trim(), phone: phone.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    Alert.alert("Profile Updated", "Your profile has been updated successfully.");
  };

  async function pickDonorAvatar() {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow access to your photo library in Settings.");
        return;
      }
    }

    if (!session) {
      Alert.alert("Sign in required", "Please sign in to upload a profile image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const mimeType = asset.mimeType || blob.type || "image/jpeg";
        const extFromMime = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
        formData.append("file", new Blob([blob], { type: mimeType }), `avatar.${extFromMime}`);
      } else {
        const uri = asset.uri;
        const ext = (uri.split(".").pop()?.split("?")[0] || "jpg").toLowerCase();
        const mime = asset.mimeType || `image/${ext === "jpg" ? "jpeg" : ext}`;
        formData.append("file", { uri, name: `avatar.${ext}`, type: mime } as any);
      }

      const uploadRes = await fetchWithAuth("/api/upload/image", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        Alert.alert("Upload Failed", (err as { error?: string }).error || "Could not upload image");
        return;
      }
      const uploadJson = await uploadRes.json() as { url: string };

      const saveRes = await fetchWithAuth("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: uploadJson.url }),
      });
      if (saveRes.ok) {
        // Cache-bust after updates so users see the latest photo immediately.
        const cacheBusted = `${uploadJson.url}${uploadJson.url.includes("?") ? "&" : "?"}v=${Date.now()}`;
        setLocalAvatarUrl(cacheBusted);
        await setAvatarUrl(cacheBusted);
      } else {
        Alert.alert("Error", "Image uploaded but failed to update profile.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong while uploading";
      Alert.alert("Error", msg);
    } finally {
      setUploadingAvatar(false);
    }
  }

  const initials = fullName
    ? fullName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const displayAvatarUrl = resolveAvatarUrl(localAvatarUrl) || resolveAvatarUrl(avatarUrl) || null;

  return (
    <>
      <View style={s2.avatarSection}>
        <Pressable onPress={pickDonorAvatar} disabled={uploadingAvatar} style={s2.avatarWrapper}>
          <View style={[s2.avatarCircle, { backgroundColor: c.green }]}>
            {displayAvatarUrl ? (
              <Image source={{ uri: displayAvatarUrl }} style={s2.avatarImage} cachePolicy="memory-disk" transition={200} />
            ) : (
              <Text style={s2.avatarText}>{initials || "U"}</Text>
            )}
          </View>
          <View style={s2.cameraOverlay}>
            {uploadingAvatar ? (
              <ActivityIndicator size={12} color={Colors.white} />
            ) : (
              <Ionicons name="camera" size={14} color={Colors.white} />
            )}
          </View>
        </Pressable>
        <Text style={[{ fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: c.textMuted, marginTop: 8 }]}>
          Tap to change photo
        </Text>
      </View>
      <InfoSection title="Personal Information">
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Full Name</Text>
          <TextInput
            style={[styles.fieldInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Enter your full name"
            placeholderTextColor={c.textLight}
            testID="edit-name-input"
          />
        </View>
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Nickname</Text>
          <TextInput
            style={[styles.fieldInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
            value={nickname}
            onChangeText={setNickname}
            placeholder="Enter your nickname"
            placeholderTextColor={c.textLight}
          />
        </View>
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Email</Text>
          <TextInput
            style={[styles.fieldInput, { backgroundColor: c.inputBg, color: c.textMuted, borderColor: c.border }]}
            value={userProfile.email}
            editable={false}
            placeholderTextColor={c.textLight}
          />
          <Text style={[styles.fieldHint, { color: c.textLight }]}>Email cannot be changed</Text>
        </View>
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Phone Number</Text>
          <TextInput
            style={[styles.fieldInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter your phone number"
            placeholderTextColor={c.textLight}
            keyboardType="phone-pad"
          />
        </View>
      </InfoSection>
      <Pressable style={s2.greenBtn} onPress={handleSave} testID="save-profile-btn">
        <Text style={s2.greenBtnText}>{saved ? "Saved!" : "Save"}</Text>
      </Pressable>
    </>
  );
}

function TransactionRow({ t, onPress, expanded }: { t: any; onPress: () => void; expanded: boolean }) {
  const c = useThemeColors();
  const type = String(t.type || "").toLowerCase();
  const isTopup = type.includes("topup") || type.includes("top_up");
  const status = String(t.status || "pending").toLowerCase();
  const isPending = status === "pending";
  const isFailed = status === "failed";
  const displayTitle = t.org_name || t.title || "Transaction";
  const d = new Date(t.date);
  const dateStr = `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Pressable onPress={onPress}>
      <View style={s2.txRow}>
        <View
          style={[
            s2.txIcon,
            { backgroundColor: isTopup ? c.successBg : c.errorBg },
          ]}
        >
          <Ionicons
            name={isTopup ? "arrow-up" : "arrow-down"}
            size={18}
            color={isTopup ? c.green : c.danger}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s2.txTitle, { color: c.text }]}>{displayTitle}</Text>
          <Text style={[s2.txDate, { color: c.textLight }]}>{dateStr}</Text>
        </View>
        <Text
          style={[
            s2.txAmount,
            { color: isTopup ? c.green : c.danger },
          ]}
        >
          {isTopup ? "+" : "-"}${Number(t.amount || 0).toFixed(2)}
        </Text>
      </View>
      {expanded && (
        <View style={[s2.txDetail, { backgroundColor: c.inputBg }]}>
          <View style={s2.txDetailRow}>
            <Text style={[s2.txDetailLabel, { color: c.textMuted }]}>Type</Text>
            <Text style={[s2.txDetailValue, { color: c.text }]}>{isTopup ? "Top Up" : "Donation"}</Text>
          </View>
          <View style={s2.txDetailRow}>
            <Text style={[s2.txDetailLabel, { color: c.textMuted }]}>Amount</Text>
            <Text style={[s2.txDetailValue, { color: isTopup ? c.green : c.danger }]}>{isTopup ? "+" : "-"}${Number(t.amount || 0).toFixed(2)}</Text>
          </View>
          <View style={s2.txDetailRow}>
            <Text style={[s2.txDetailLabel, { color: c.textMuted }]}>Date</Text>
            <Text style={[s2.txDetailValue, { color: c.text }]}>{dateStr}</Text>
          </View>
          <View style={s2.txDetailRow}>
            <Text style={[s2.txDetailLabel, { color: c.textMuted }]}>Status</Text>
            <View style={[s2.txStatusBadge, { backgroundColor: isFailed ? c.errorBg : isPending ? c.warningBg : c.successBg }]}>
              <Text style={[s2.txStatusText, { color: isFailed ? c.danger : isPending ? c.warningAmber : c.green }]}>
                {isFailed ? "Failed" : isPending ? "Pending" : "Completed"}
              </Text>
            </View>
          </View>
          <View style={s2.txDetailRow}>
            <Text style={[s2.txDetailLabel, { color: c.textMuted }]}>Reference</Text>
            <Text style={[s2.txDetailValue, { color: c.text }]}>GBK-{String(t.id || "").slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function TransactionsPage() {
  const c = useThemeColors();
  const { transactions, refresh } = useApp();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const filtered = transactions.filter((t) => String(t.title || "").toLowerCase().includes(search.toLowerCase()));

  const grouped: Record<string, typeof transactions> = {};
  filtered.forEach((t) => {
    const d = new Date(t.date);
    const key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  const months = Object.keys(grouped);

  return (
    <>
      <View style={[s2.searchBar, { backgroundColor: c.cardBg, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.textLight} />
        <TextInput
          style={[s2.searchInput, { color: c.text }]}
          placeholder="Search transactions..."
          placeholderTextColor={c.textLight}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={c.textLight} />
          </Pressable>
        )}
      </View>
      {months.length === 0 && (
        <View style={s2.emptyState}>
          <Ionicons name="receipt-outline" size={48} color={c.textLight} />
          <Text style={[s2.emptyText, { color: c.textLight }]}>No transactions yet</Text>
        </View>
      )}
      {months.map((month) => (
        <View key={month} style={{ marginBottom: 20 }}>
          <Text style={[s2.monthLabel, { color: c.textMuted }]}>{month}</Text>
          <View style={[styles.sectionCard, { backgroundColor: c.cardBg, shadowColor: c.cardShadow }]}>
            {grouped[month].map((t, i) => (
              <React.Fragment key={t.id}>
                {i > 0 && <View style={[styles.sep, { backgroundColor: c.border }]} />}
                <TransactionRow
                  t={t}
                  expanded={expandedId === t.id}
                  onPress={() => setExpandedId(expandedId === t.id ? null : t.id)}
                />
              </React.Fragment>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function SubscriptionSettingsPage() {
  const c = useThemeColors();
  const { session, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState<{
    org_id: string | null;
    subscription?: {
      tier: string;
      status: string;
      current_period_end: string | null;
      cancel_at_period_end?: boolean;
    };
  } | null>(null);

  async function loadSubscription() {
    if (!session?.accessToken) return;
    try {
      const data = await apiGet<typeof sub>("/api/charity/my-subscription", session.accessToken);
      setSub(data);
    } catch {
      // keep existing value on failure
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubscription();
  }, [session?.accessToken]);

  async function handleManageBilling() {
    if (!sub?.org_id || !session?.accessToken || busy) return;
    setBusy(true);
    try {
      const data = await apiPost<{ url?: string; error?: string; message?: string }>(
        "/api/subscriptions/create-portal-session",
        { org_id: sub.org_id },
        session.accessToken
      );
      if (!data?.url) {
        Alert.alert("Billing portal unavailable", data?.error || data?.message || "Could not open billing portal.");
        return;
      }
      await Linking.openURL(String(data.url));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not open billing portal.";
      Alert.alert("Billing portal unavailable", msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelPlan() {
    if (!sub?.org_id || !session?.accessToken || busy) return;
    Alert.alert(
      "Cancel plan",
      "Cancel at period end? You will keep premium features until your expiry date.",
      [
        { text: "Keep plan", style: "cancel" },
        {
          text: "Cancel at expiry",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await apiPost(
                "/api/subscriptions/cancel-native",
                { org_id: sub.org_id },
                session.accessToken
              );
              Alert.alert("Cancellation scheduled", "Your subscription will stop at the end of this billing period.");
              await loadSubscription();
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Could not cancel subscription.";
              Alert.alert("Cancel failed", msg);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  if (user?.type !== "charity") {
    return (
      <View style={s2.emptyState}>
        <Ionicons name="card-outline" size={44} color={c.textLight} />
        <Text style={[s2.emptyText, { color: c.textLight }]}>This page is available for organization accounts.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s2.emptyState}>
        <Text style={[s2.emptyText, { color: c.textLight }]}>Loading subscription...</Text>
      </View>
    );
  }

  const tier = String(sub?.subscription?.tier || "free");
  const status = String(sub?.subscription?.status || "active");
  const periodEnd = sub?.subscription?.current_period_end
    ? new Date(String(sub.subscription.current_period_end)).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";
  const cancelAtPeriodEnd = Boolean(sub?.subscription?.cancel_at_period_end);
  const autoPay = tier !== "free" && !cancelAtPeriodEnd;

  return (
    <>
      <InfoSection title="Subscription">
        <SettingRow icon="ribbon-outline" label="Current plan" description={tier.charAt(0).toUpperCase() + tier.slice(1)} />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow icon="time-outline" label="Status" description={status} />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow icon="calendar-outline" label="Expiry date" description={periodEnd} />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow icon="repeat-outline" label="Auto-pay renewal" description={autoPay ? "Enabled (Stripe auto-renews monthly)" : "Disabled (cancels at period end)"} />
      </InfoSection>
      <InfoSection title="Billing actions">
        <SettingRow
          icon="rocket-outline"
          label="Upgrade Plan"
          description={tier === "free" ? "Move to Growth or Institutional plan" : "Change to a different paid plan"}
          onPress={() => {
            if (user?.type === "charity") router.push("/(org)/subscriptions");
          }}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="card-outline"
          label="Manage Plan"
          description={tier === "free" ? "Upgrade to a paid plan to manage billing details" : "Update card, invoices, and payment methods"}
          onPress={tier === "free" ? undefined : handleManageBilling}
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <SettingRow
          icon="close-circle-outline"
          label="Cancel Plan"
          description={tier === "free" ? "No active paid plan to cancel" : "Stop renewal at end of current billing period"}
          onPress={tier === "free" ? undefined : handleCancelPlan}
        />
      </InfoSection>
      {busy && (
        <View style={s2.emptyState}>
          <Text style={[s2.emptyText, { color: c.textLight }]}>Processing...</Text>
        </View>
      )}
    </>
  );
}

function SettingsMainPage() {
  const c = useThemeColors();
  const { isDark, theme, setTheme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const menuItems = [
    ...(user?.type === "charity"
      ? [{ icon: "card-outline" as const, label: "Subscription", color: c.iconBgBlue, route: "/settings/subscription" }]
      : []),
    { icon: "call-outline", label: "Contact", color: c.iconBgBlue, route: "/settings/help" },
    { icon: "help-circle-outline", label: "How to Donate", color: c.iconBgGreen, route: "/settings/how-to-donate" },
    { icon: "shield-checkmark-outline", label: "Privacy", color: c.iconBgPurple, route: "/settings/privacy-settings" },
    { icon: "settings-outline", label: "Advanced Settings", color: c.iconBgGrey, route: "/settings/notifications" },
  ];

  const themeOptions: { mode: "light" | "dark" | "system"; icon: string; label: string }[] = [
    { mode: "light", icon: "sunny-outline", label: "Light" },
    { mode: "dark", icon: "moon-outline", label: "Dark" },
    { mode: "system", icon: "phone-portrait-outline", label: "System" },
  ];

  return (
    <>
      <View style={[styles.sectionCard, { backgroundColor: c.cardBg, shadowColor: c.cardShadow }]}>
        <View style={sMain.appearanceSection}>
          <Text style={[sMain.appearanceLabel, { color: c.textMuted }]}>Appearance</Text>
          <View style={[sMain.themeSelector, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}>
            {themeOptions.map((opt) => {
              const active = theme === opt.mode;
              return (
                <Pressable
                  key={opt.mode}
                  style={[
                    sMain.themePill,
                    active && { backgroundColor: Colors.green },
                  ]}
                  onPress={() => setTheme(opt.mode)}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={15}
                    color={active ? Colors.white : c.textMuted}
                  />
                  <Text style={[sMain.themePillText, { color: active ? Colors.white : c.textMuted }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        {menuItems.map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <View style={[styles.sep, { backgroundColor: c.border }]} />}
            <Pressable
              style={s2.menuRow}
              onPress={() => router.push(item.route as any)}
            >
              <View style={[s2.menuIconCircle, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon as any} size={20} color={c.text} />
              </View>
              <Text style={[s2.menuLabel, { color: c.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={c.textLight} />
            </Pressable>
          </React.Fragment>
        ))}
      </View>
    </>
  );
}

const sMain = StyleSheet.create({
  appearanceSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 10,
  },
  appearanceLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  themeSelector: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  themePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 9,
  },
  themePillText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
  },
});

function HowToDonatePage() {
  const c = useThemeColors();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string>("how-it-works");

  const navItems: { id: string; label: string; icon: any }[] = [
    { id: "how-it-works", label: "What happens", icon: "sparkles-outline" },
    { id: "safe-payments", label: "Safe payments", icon: "shield-checkmark-outline" },
    { id: "verification", label: "Verification", icon: "people-checkmark-outline" },
    { id: "store-verification", label: "App store", icon: "storefront-outline" },
    { id: "receipts", label: "Receipts & tax", icon: "receipt-outline" },
    { id: "refunds", label: "Refunds", icon: "refresh-circle-outline" },
  ];

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? "" : id));
  }

  function AccordionSection({ id, title, body }: { id: string; title: string; body: string }) {
    const expanded = expandedId === id;
    return (
      <Pressable style={styles.faqRow} onPress={() => toggle(id)}>
        <View style={styles.faqHeader}>
          <Text style={[styles.faqQuestion, { color: c.text }]}>{title}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={c.textLight} />
        </View>
        {expanded && <Text style={[styles.faqAnswer, { color: c.textMuted }]}>{body}</Text>}
      </Pressable>
    );
  }

  return (
    <>
      <View style={[styles.sectionCard, { backgroundColor: c.cardBg, shadowColor: c.cardShadow }]}>
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, color: c.text }}>How to Donate</Text>
          <Text style={{ fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: c.textMuted, lineHeight: 20 }}>
            Not legal advice. Donation eligibility and tax deductibility depend on the receiving organization and your personal situation.
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {navItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setExpandedId(item.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: expandedId === item.id ? c.green : c.border,
                  backgroundColor: expandedId === item.id ? c.green : c.cardBg,
                }}
              >
                <Ionicons name={item.icon} size={16} color={expandedId === item.id ? "#fff" : c.textMuted} />
                <Text
                  style={{
                    fontFamily: "SpaceGrotesk_600SemiBold",
                    fontSize: 12,
                    color: expandedId === item.id ? "#fff" : c.text,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: c.cardBg, shadowColor: c.cardShadow, marginTop: 12 }]}>
        <AccordionSection
          id="how-it-works"
          title="What happens when you donate (simple flow)"
          body={
            "1) Pick an organization in the Give tab.\n\n2) Choose an amount (or type a custom amount) and confirm if you want to donate anonymously.\n\n3) Your payment is processed securely by Stripe using the Stripe PaymentSheet.\n\n4) Once payment is successful, your donation is sent to the selected organization.\n\n5) After processing completes, you’ll be able to access a donation receipt and track your giving from your Profile."
          }
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <AccordionSection
          id="safe-payments"
          title="How your payment gets safe hands (Stripe)"
          body={
            "GiveBlack does not charge you platform fees.\n\nPayments are processed by Stripe (PCI DSS Level 1 compliant). Your card details are tokenized by Stripe and never stored on GiveBlack servers. Standard payment processing fees charged by Stripe may apply and are borne by the receiving organization.\n\nIn the app, GiveBlack requests a payment intent from our backend, then shows the Stripe PaymentSheet on your device, so card entry happens inside Stripe’s secure UI."
          }
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <AccordionSection
          id="verification"
          title="How verification works (orgs and people behind them)"
          body={
            "Organization accounts are subject to an additional verification and approval process.\n\nGiveBlack verifies that organizations listed on the app are registered 501(c)(3) nonprofits (or equivalent entities). We may also request documentation, and organizations are expected to maintain their status and respond to questions.\n\nEven with verification, GiveBlack does not guarantee the actions or outcomes of any organization, so donors are encouraged to do their own research too."
          }
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <AccordionSection
          id="store-verification"
          title="Is this legal? What about App Store / Play Store checks"
          body={
            "If you install GiveBlack from the official Apple App Store or Google Play Store, your installation uses Apple/Google’s distribution, security, and app-protection processes.\n\nThe app store checks are separate from GiveBlack’s organization verification. Organization verification is handled inside the product, while payment handling is handled by Stripe.\n\nThis is a standard, legal donation and payment flow using Stripe (card processing) and app distribution from official stores. This page explains how verification is described in the app and is not legal advice."
          }
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <AccordionSection
          id="receipts"
          title="Receipts, tracking, and tax notes"
          body={
            "Receipts: GiveBlack provides donation receipts for your records.\n\nTax: GiveBlack does not provide tax advice. Consult a qualified tax professional to determine tax deductibility. The receiving organization is responsible for providing any required tax documentation (such as IRS Form 990).\n\nTracking: You can view your donation history from your Profile (amounts, dates, and organizations)."
          }
        />
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <AccordionSection
          id="refunds"
          title="Refunds"
          body={
            "Donations are generally non-refundable once processed. In exceptional circumstances (like duplicate charges or processing errors), refunds may be requested by contacting support.\n\nIf you need help, contact support@giveblack.org."
          }
        />
      </View>
    </>
  );
}

function HelpCenterPage() {
  const c = useThemeColors();
  const faqData = [
    { q: "How do I make a donation?", a: "Navigate to the Give tab, browse organizations by category, select an organization, choose your donation amount, and confirm. Your donation is processed securely." },
    { q: "Is my donation tax-deductible?", a: "All organizations on GiveBlack are verified 501(c)(3) nonprofits. You will receive a donation receipt via email that can be used for tax purposes." },
    { q: "How do I track my donations?", a: "Visit your Profile tab to see your complete donation history, including amounts, dates, and the organizations you've supported." },
    { q: "Can I set up recurring donations?", a: "Recurring donations will be available in a future update. Currently, all donations are one-time gifts." },
    { q: "How are charities verified?", a: "Every charity undergoes a thorough vetting process. Our team verifies their 501(c)(3) status, bank information, and organizational mission before they appear on the platform." },
    { q: "How do I get a refund?", a: "Please contact support at support@giveblack.org within 48 hours of your donation. Refunds are processed on a case-by-case basis." },
  ];

  return (
    <>
      <View style={[styles.sectionCard, { backgroundColor: c.cardBg, shadowColor: c.cardShadow }]}>
        {faqData.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={[styles.sep, { backgroundColor: c.border }]} />}
            <FAQItem question={item.q} answer={item.a} />
          </React.Fragment>
        ))}
      </View>
    </>
  );
}

function PrivacySettingsPage() {
  const c = useThemeColors();
  return (
    <>
      <View style={[styles.sectionCard, { backgroundColor: c.cardBg, shadowColor: c.cardShadow }]}>
        <Pressable
          style={s2.menuRow}
          onPress={() => Alert.alert("Privacy Policy", "Our privacy policy details how we collect, use, and protect your personal data. Visit giveblack.org/privacy for the full document.")}
        >
          <View style={[s2.menuIconCircle, { backgroundColor: c.iconBgBlue }]}>
            <Ionicons name="shield-checkmark" size={20} color={c.iconFgBlue} />
          </View>
          <Text style={[s2.menuLabel, { color: c.text }]}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={16} color={c.textLight} />
        </Pressable>
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        <Pressable
          style={s2.menuRow}
          onPress={() =>
            Alert.alert(
              "Delete All Private Data",
              "Are you sure you want to delete all your private data? This action cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () =>
                    Alert.alert("Data Deleted", "All your private data has been deleted."),
                },
              ]
            )
          }
        >
          <View style={[s2.menuIconCircle, { backgroundColor: c.iconBgRed }]}>
            <Ionicons name="trash" size={20} color={c.danger} />
          </View>
          <Text style={[s2.menuLabel, { color: c.danger }]}>Delete all private data</Text>
          <Ionicons name="chevron-forward" size={16} color={c.textLight} />
        </Pressable>
      </View>
    </>
  );
}

const INVITE_SHARE_MESSAGE =
  "I just joined GiveBlack, a platform that connects donors with Black-led causes and community programs. Come support with me! https://giveblackapp.com";

function InviteFriendsPage() {
  const c = useThemeColors();

  async function handleShare() {
    try {
      await Share.share({ message: INVITE_SHARE_MESSAGE });
    } catch {
      // user cancelled or share unavailable
    }
  }

  return (
    <>
      <View style={[s2.inviteHeroCard, { backgroundColor: c.cardBg }]}>
        <View style={[s2.inviteIconCircle, { backgroundColor: c.background }]}>
          <Ionicons name="people" size={32} color={Colors.green} />
        </View>
        <Text style={[s2.inviteHeroTitle, { color: c.text }]}>Spread the word</Text>
        <Text style={[s2.inviteHeroSubtitle, { color: c.textMuted }]}>
          Invite friends to join GiveBlack and support Black-led causes together. Share via Messages, WhatsApp, email, or any app you like.
        </Text>
      </View>

      <View style={[s2.invitePreviewCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
        <Text style={[s2.invitePreviewLabel, { color: c.textMuted }]}>Your invite message</Text>
        <Text style={[s2.invitePreviewText, { color: c.text }]}>{INVITE_SHARE_MESSAGE}</Text>
      </View>

      <Pressable style={s2.inviteShareBtn} onPress={handleShare}>
        <Ionicons name="share-social-outline" size={20} color={Colors.white} />
        <Text style={s2.inviteShareBtnText}>Share GiveBlack</Text>
      </Pressable>
    </>
  );
}

const GUEST_LOCKED_PAGES = ["transactions", "edit-profile", "privacy", "subscription", "notifications"];

const GUEST_LOCK_CONFIG: Record<string, { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; message: string }> = {
  transactions: {
    icon: "receipt-outline",
    title: "View your transactions",
    message: "Create a free account to see your full donation and transaction history all in one place.",
  },
  "edit-profile": {
    icon: "person-outline",
    title: "Edit your profile",
    message: "Create a free account to set up your profile, upload a photo, and personalize your GiveBlack experience.",
  },
  privacy: {
    icon: "lock-closed-outline",
    title: "Privacy & Security",
    message: "Create a free account to manage your password, biometric login, and account data settings.",
  },
  subscription: {
    icon: "star-outline",
    title: "Manage your subscription",
    message: "Create a free account to view and manage your GiveBlack subscription and billing details.",
  },
  notifications: {
    icon: "notifications-outline",
    title: "Notification preferences",
    message: "Create a free account to personalise which push notifications you receive from GiveBlack.",
  },
};

export default function SettingsDetailScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const router = useRouter();
  const insets = useSafeInsets();
  const bottomPad = insets.bottom;
  const { isGuest } = useAuth();
  const c = useThemeColors();

  const isLockedForGuest = isGuest && GUEST_LOCKED_PAGES.includes(page || "");
  const lockConfig = isLockedForGuest ? GUEST_LOCK_CONFIG[page || ""] : null;
  const [showGuestSheet, setShowGuestSheet] = useState(true);

  useEffect(() => {
    if (isLockedForGuest) setShowGuestSheet(true);
  }, [page, isLockedForGuest]);

  const titles: Record<string, string> = {
    notifications: "Notifications",
    privacy: "Privacy & Security",
    help: "Help & Support",
    terms: "Terms of Service",
    share: "Share GiveBlack",
    "edit-profile": "Edit Profile",
    "privacy-policy": "Privacy Policy",
    "terms-of-service": "Terms of Service",
    transactions: "Transactions",
    subscription: "Subscription",
    main: "Settings",
    "how-to-donate": "How to Donate",
    "help-center": "Help Center",
    "privacy-settings": "Privacy",
    invite: "Invite Friends",
  };

  const renderContent = () => {
    switch (page) {
      case "notifications":
        return <NotificationsPage />;
      case "privacy":
        return <PrivacyPage />;
      case "help":
        return <HelpPage />;
      case "terms":
        return <TermsPage />;
      case "share":
        return <SharePage />;
      case "edit-profile":
        return <EditProfilePage />;
      case "privacy-policy":
        return <PrivacyPolicyPage />;
      case "terms-of-service":
        return <TermsOfServicePage />;
      case "transactions":
        return <TransactionsPage />;
      case "subscription":
        return <SubscriptionSettingsPage />;
      case "main":
        return <SettingsMainPage />;
      case "how-to-donate":
        return <HowToDonatePage />;
      case "help-center":
        return <HelpCenterPage />;
      case "privacy-settings":
        return <PrivacySettingsPage />;
      case "invite":
        return <InviteFriendsPage />;
      default:
        return <Text style={[styles.legalText, { color: c.textMuted }]}>Page not found</Text>;
    }
  };

  if (isLockedForGuest && lockConfig) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader showBack title={titles[page || ""] || "Settings"} showSearch={false} />
        <View style={styles.lockedEmptyState}>
          <Ionicons name={lockConfig.icon} size={52} color={c.textLight} />
          <Text style={[styles.lockedEmptyTitle, { color: c.text }]}>{lockConfig.title}</Text>
          <Text style={[styles.lockedEmptyMsg, { color: c.textMuted }]}>
            Sign in or create a free account to access this feature.
          </Text>
          <Pressable style={[styles.lockedEmptyBtn, { backgroundColor: c.green }]} onPress={() => setShowGuestSheet(true)}>
            <Text style={styles.lockedEmptyBtnText}>Create Account</Text>
          </Pressable>
        </View>
        <GuestLockSheet
          visible={showGuestSheet}
          icon={lockConfig.icon}
          title={lockConfig.title}
          message={lockConfig.message}
          onCreateAccount={() =>
            router.push({
              pathname: "/(auth)/donor-signup",
              params: { returnTo: `/settings/${page}`, feature: page || "" },
            })
          }
          onDismiss={() => setShowGuestSheet(false)}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader showBack title={titles[page || ""] || "Settings"} showSearch={false} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 24 }]}
        keyboardDismissMode="interactive"
      >
        {renderContent()}
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  lockedEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 12,
  },
  lockedEmptyTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    textAlign: "center",
    marginTop: 8,
  },
  lockedEmptyMsg: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  lockedEmptyBtn: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  lockedEmptyBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    color: Colors.white,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  rowDesc: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sep: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  faqRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  faqQuestion: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.primary,
    flex: 1,
    paddingRight: 10,
  },
  faqAnswer: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 20,
    marginTop: 10,
  },
  legalContent: {
    padding: 16,
  },
  legalDate: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textLight,
    marginBottom: 16,
  },
  legalHeading: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
    marginTop: 16,
    marginBottom: 6,
  },
  legalSubheading: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.primary,
    marginTop: 10,
    marginBottom: 4,
  },
  legalText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  shareHero: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  shareIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.gold + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  shareTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 24,
    color: Colors.primary,
  },
  shareSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  impactGrid: {
    flexDirection: "row",
    padding: 16,
    gap: 8,
  },
  impactItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.cream,
    borderRadius: 12,
    paddingVertical: 16,
  },
  impactValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    color: Colors.green,
  },
  impactLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  fieldGroup: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldInput: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
    color: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.cream,
  },
  fieldHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  saveBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.white,
  },
});

const s2 = StyleSheet.create({
  avatarSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  avatarWrapper: {
    width: 90,
    height: 90,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 28,
    color: Colors.white,
  },
  cameraOverlay: {
    position: "absolute" as const,
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.white,
  },
  greenBtn: {
    backgroundColor: Colors.green,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  greenBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.white,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.primary,
    padding: 0,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 15,
    color: Colors.textLight,
  },
  monthLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  txTitle: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  txDate: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  contactInitials: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.white,
  },
  contactName: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  contactPhone: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  inviteHeroCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  inviteIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  inviteHeroTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    marginBottom: 10,
    textAlign: "center",
  },
  inviteHeroSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  invitePreviewCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  invitePreviewLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  invitePreviewText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    lineHeight: 22,
  },
  inviteShareBtn: {
    backgroundColor: Colors.green,
    borderRadius: 30,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  inviteShareBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  txDetail: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  txDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  txDetailLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  txDetailValue: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.primary,
  },
  txStatusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  txStatusText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.green,
  },
  pinSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  pinInput: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
    color: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.cream,
    letterSpacing: 8,
    textAlign: "center",
  },
  pinSaveBtn: {
    backgroundColor: Colors.green,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  pinSaveBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.white,
  },
});
