import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  Switch,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeInsets } from "@/lib/safe-area";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

interface MenuItemProps {
  icon: string;
  label: string;
  iconBg: string;
  iconColor: string;
  onPress?: () => void;
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (val: boolean) => void;
  textColor?: string;
  chevronColor?: string;
  greenColor?: string;
  dangerLabel?: boolean;
}

function MenuItem({ icon, label, iconBg, iconColor, onPress, isSwitch, switchValue, onSwitchChange, textColor, chevronColor, greenColor, dangerLabel }: MenuItemProps) {
  const tc = useThemeColors();
  return (
    <Pressable style={styles.menuItem} onPress={isSwitch ? undefined : onPress}>
      <View style={[styles.menuIconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <Text style={[styles.menuLabel, { color: textColor }, dangerLabel && { color: tc.danger }]}>{label}</Text>
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: tc.border, true: greenColor || tc.green }}
          thumbColor={Colors.white}
        />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={chevronColor || tc.textLight} />
      )}
    </Pressable>
  );
}

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

const GUEST_BENEFITS: { icon: IoniconsName; label: string }[] = [
  { icon: "bar-chart-outline", label: "Track your impact over time" },
  { icon: "heart-outline", label: "Save your favourite campaigns" },
  { icon: "receipt-outline", label: "Get tax receipts for every donation" },
];

function GuestAccountScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const { logout, guestLogin } = useAuth();
  const { lastMeaningfulRoute } = useApp();
  const insets = useSafeInsets();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100, alignItems: "center" },
        ]}
      >
        <Animated.View entering={FadeInDown.delay(0).duration(400)} style={styles.guestHeroWrap}>
          <View style={[styles.guestIconCircle, { backgroundColor: c.green + "22" }]}>
            <Ionicons name="person-circle-outline" size={72} color={c.green} />
          </View>
          <Text style={[styles.guestTitle, { color: c.text }]}>You're browsing as a guest</Text>
          <Text style={[styles.guestSubtitle, { color: c.textMuted }]}>
            Create a free account to unlock the full GiveBlack experience.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={[styles.guestBenefitsCard, { backgroundColor: c.cardBg }]}>
          {GUEST_BENEFITS.map((b, i) => (
            <React.Fragment key={b.icon}>
              <View style={styles.guestBenefitRow}>
                <View style={[styles.guestBenefitIcon, { backgroundColor: c.green + "18" }]}>
                  <Ionicons name={b.icon} size={20} color={c.green} />
                </View>
                <Text style={[styles.guestBenefitText, { color: c.text }]}>{b.label}</Text>
              </View>
              {i < GUEST_BENEFITS.length - 1 && <View style={[styles.menuSep, { backgroundColor: c.border, marginLeft: 58 }]} />}
            </React.Fragment>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.guestCtaWrap}>
          <Pressable
            style={[styles.guestCtaPrimary, { backgroundColor: c.green }]}
            onPress={() =>
              router.push(
                lastMeaningfulRoute
                  ? { pathname: "/(auth)/donor-signup", params: { returnTo: lastMeaningfulRoute } }
                  : "/(auth)/donor-signup"
              )
            }
          >
            <Text style={styles.guestCtaPrimaryText}>Create Free Account</Text>
          </Pressable>
          <Pressable
            style={[styles.guestCtaSecondary, { borderColor: c.green }]}
            onPress={() =>
              router.push(
                lastMeaningfulRoute
                  ? { pathname: "/(auth)/donor-login", params: { returnTo: lastMeaningfulRoute } }
                  : "/(auth)/donor-login"
              )
            }
          >
            <Text style={[styles.guestCtaSecondaryText, { color: c.green }]}>Sign In</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(400)}>
          <Pressable style={styles.guestLogoutBtn} onPress={() => setShowLogoutModal(true)}>
            <Ionicons name="log-out-outline" size={18} color={c.danger} />
            <Text style={[styles.guestLogoutText, { color: c.danger }]}>Leave guest mode</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      <Modal visible={showLogoutModal} transparent animationType="fade">
        <Pressable style={[styles.modalOverlay, { backgroundColor: c.modalOverlay }]} onPress={() => setShowLogoutModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: c.cardBg }]}>
            <Text style={[styles.modalText, { color: c.text }]}>Leave guest mode?</Text>
            <View style={styles.modalBtns}>
              <Pressable style={[styles.cancelBtn, { borderColor: c.green }]} onPress={() => setShowLogoutModal(false)}>
                <Text style={[styles.cancelBtnText, { color: c.green }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.okBtn, { backgroundColor: c.green }]}
                onPress={async () => {
                  setShowLogoutModal(false);
                  await logout();
                  await guestLogin();
                  router.replace("/(tabs)");
                }}
              >
                <Text style={styles.okBtnText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function AccountScreen() {
  const { isGuest } = useAuth();

  if (isGuest) {
    return <GuestAccountScreen />;
  }

  return <AuthenticatedAccountScreen />;
}

function AuthenticatedAccountScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const { walletBalance, userProfile, updateProfile } = useApp();
  const { user, avatarUrl, donationSummary, logout, guestLogin } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const insets = useSafeInsets();
  const bottomPad = insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}
      >
        <Animated.View entering={FadeInDown.delay(0).duration(400)} style={styles.header}>
          <View>
            <Text style={[styles.helloText, { color: c.textMuted }]}>Hello,</Text>
            <Text style={[styles.userName, { color: c.text }]}>{userProfile.fullName || user?.name || "GiveBlack Member"}</Text>
          </View>
          <Pressable onPress={() => router.push("/notifications")} testID="notifications-btn">
            <Ionicons name="notifications-outline" size={26} color={c.text} />
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(400)} style={[styles.profileCard, { backgroundColor: c.cardBg }]}>
          <View style={styles.profileLeft}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} cachePolicy="memory-disk" transition={200} />
            ) : (
              <View style={[styles.avatarCircle, { backgroundColor: c.green }]}>
                <Text style={styles.avatarInitial}>
                  {(userProfile.fullName || user?.name || "U").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.profileTextCol}>
              <Text
                style={[styles.profileName, { color: c.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {userProfile.fullName || user?.name || "GiveBlack Member"}
              </Text>
              <Text
                style={[styles.profileEmail, { color: c.textMuted }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {user?.email || ""}
              </Text>
              {donationSummary && (
                <>
                  <Text style={[styles.profileStat, { color: c.textMuted }]} numberOfLines={1}>
                    Total donated: ${(donationSummary.total_amount_cents / 100).toFixed(2)}
                  </Text>
                  {donationSummary.rank && (
                    <Text style={[styles.profileStat, { color: c.green }]} numberOfLines={1}>
                      Global rank: #{donationSummary.rank}
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
          <Pressable style={styles.profileEditBtn} onPress={() => router.push("/(account)/impact")}>
            <Ionicons name="stats-chart-outline" size={18} color={c.green} />
            <Text style={[styles.profileEditText, { color: c.green }]}>View impact</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(400)} style={[styles.menuCard, { backgroundColor: c.cardBg }]}>
          <MenuItem
            icon="receipt-outline"
            label="Transactions"
            iconBg={c.iconBgGreen}
            iconColor={c.iconFgGreen}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/transactions")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="heart-outline"
            label="Favorites"
            iconBg={c.iconBgRed}
            iconColor={c.iconFgRed}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/(tabs)/favourite")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="person-outline"
            label="Edit profile"
            iconBg={c.iconBgBlue}
            iconColor={c.iconFgBlue}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/edit-profile")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="eye-off-outline"
            label="Donate as anonymous"
            iconBg={c.iconBgPurple}
            iconColor={c.iconFgPurple}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            isSwitch
            switchValue={userProfile.donateAnonymous}
            onSwitchChange={(val) => updateProfile({ donateAnonymous: val })}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="people-outline"
            label="Invite friends"
            iconBg={c.iconBgOrange}
            iconColor={c.iconFgOrange}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/invite")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            iconBg={c.iconBgBlue}
            iconColor={c.iconFgBlue}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/notifications")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="settings-outline"
            label="Settings & Appearance"
            iconBg={c.iconBgGrey}
            iconColor={c.iconFgGrey}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/main")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="log-out-outline"
            label="Logout"
            iconBg={c.iconBgRed}
            iconColor={c.iconFgRed}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            dangerLabel
            onPress={() => setShowLogoutModal(true)}
          />
        </Animated.View>
      </ScrollView>

      <Modal visible={showLogoutModal} transparent animationType="fade">
        <Pressable style={[styles.modalOverlay, { backgroundColor: c.modalOverlay }]} onPress={() => setShowLogoutModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: c.cardBg }]}>
            <Text style={[styles.modalText, { color: c.text }]}>Are you sure you want to Logout?</Text>
            <View style={styles.modalBtns}>
              <Pressable style={[styles.cancelBtn, { borderColor: c.green }]} onPress={() => setShowLogoutModal(false)}>
                <Text style={[styles.cancelBtnText, { color: c.green }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.okBtn, { backgroundColor: c.green }]}
                onPress={async () => {
                  setShowLogoutModal(false);
                  await logout();
                  await guestLogin();
                  router.replace("/(tabs)");
                }}
              >
                <Text style={styles.okBtnText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    flexGrow: 1,
  },
  profileCard: {
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  profileLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  profileTextCol: {
    flex: 1,
    minWidth: 0,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    color: Colors.white,
  },
  profileName: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
  },
  profileEmail: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  profileEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    marginLeft: 8,
  },
  profileEditText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  profileStat: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 20,
  },
  helloText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
  },
  userName: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 24,
    marginTop: -2,
  },
  walletCard: {
    borderRadius: 20,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  walletLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  walletIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  walletLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
  },
  walletBalance: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 26,
    color: Colors.white,
    marginTop: -2,
  },
  topUpBtn: {
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  topUpText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.white,
  },
  menuCard: {
    borderRadius: 20,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  menuIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 15,
  },
  menuSep: {
    height: 1,
    marginLeft: 74,
    marginRight: 18,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  modalCard: {
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center",
  },
  modalText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 17,
    textAlign: "center",
    marginBottom: 24,
  },
  modalBtns: {
    flexDirection: "row",
    gap: 14,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  okBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  okBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    color: Colors.white,
  },
  guestHeroWrap: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 32,
    width: "100%",
  },
  guestIconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  guestTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    textAlign: "center",
    marginBottom: 10,
  },
  guestSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  guestBenefitsCard: {
    borderRadius: 20,
    paddingVertical: 6,
    width: "100%",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  guestBenefitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  guestBenefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  guestBenefitText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 15,
    flex: 1,
  },
  guestCtaWrap: {
    width: "100%",
    gap: 12,
    marginBottom: 24,
  },
  guestCtaPrimary: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  guestCtaPrimaryText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.white,
  },
  guestCtaSecondary: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1.5,
  },
  guestCtaSecondaryText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
  },
  guestLogoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  guestLogoutText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
});
