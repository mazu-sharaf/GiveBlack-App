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
import { useTheme, useThemeColors } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

interface MenuItemProps {
  icon: string;
  label: string;
  iconBg: string;
  onPress?: () => void;
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (val: boolean) => void;
  textColor?: string;
  chevronColor?: string;
  greenColor?: string;
}

function MenuItem({ icon, label, iconBg, onPress, isSwitch, switchValue, onSwitchChange, textColor, chevronColor, greenColor }: MenuItemProps) {
  const tc = useThemeColors();
  return (
    <Pressable style={styles.menuItem} onPress={isSwitch ? undefined : onPress}>
      <View style={[styles.menuIconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={20} color={iconBg === "#F5F5F5" || iconBg === "#2A2A2A" ? "#666" : iconBg === "#FFEBEE" || iconBg === "#3D1515" ? "#E53935" : darken(iconBg)} />
      </View>
      <Text style={[styles.menuLabel, { color: textColor }, label === "Logout" && { color: "#E53935" }]}>{label}</Text>
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: tc.border, true: greenColor || tc.green }}
          thumbColor="#FFFFFF"
        />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={chevronColor || tc.textLight} />
      )}
    </Pressable>
  );
}

function darken(hex: string): string {
  const colors: Record<string, string> = {
    "#E8F5E9": "#2E7D32",
    "#E3F2FD": "#1565C0",
    "#F3E5F5": "#7B1FA2",
    "#FFF3E0": "#E65100",
    "#FFEBEE": "#E53935",
    "#1B2E1B": "#4CAF50",
    "#1B2A3D": "#42A5F5",
    "#2D1B3D": "#CE93D8",
    "#3D2A1B": "#FFB74D",
    "#3D1515": "#E53935",
  };
  return colors[hex] || Colors.primary;
}

export default function AccountScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const { isDark, toggleTheme, theme, setTheme } = useTheme();
  const { walletBalance, userProfile, updateProfile } = useApp();
  const { user, avatarUrl, donationSummary, logout } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const insets = useSafeInsets();
  const bottomPad = insets.bottom;

  const iconBgs = isDark
    ? { green: "#1B2E1B", blue: "#1B2A3D", purple: "#2D1B3D", orange: "#3D2A1B", red: "#3D1515", grey: "#2A2A2A", moon: "#2D2A1B" }
    : { green: "#E8F5E9", blue: "#E3F2FD", purple: "#F3E5F5", orange: "#FFF3E0", red: "#FFEBEE", grey: "#F5F5F5", moon: "#FFF3E0" };

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
            iconBg={iconBgs.green}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/transactions")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="person-outline"
            label="Edit profile"
            iconBg={iconBgs.blue}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/edit-profile")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="moon-outline"
            label="Dark Mode"
            iconBg={iconBgs.moon}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            isSwitch
            switchValue={isDark}
            onSwitchChange={() => toggleTheme()}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="eye-off-outline"
            label="Donate as anonymous"
            iconBg={iconBgs.purple}
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
            iconBg={iconBgs.orange}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/invite")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            iconBg={iconBgs.blue}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/notifications")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="settings-outline"
            label="Settings"
            iconBg={iconBgs.grey}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
            onPress={() => router.push("/settings/main")}
          />
          <View style={[styles.menuSep, { backgroundColor: c.border }]} />
          <MenuItem
            icon="log-out-outline"
            label="Logout"
            iconBg={iconBgs.red}
            textColor={c.text}
            chevronColor={c.textLight}
            greenColor={c.green}
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
                  router.replace("/(auth)/welcome");
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
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  profileName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  profileEmail: {
    fontFamily: "Poppins_400Regular",
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
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  profileStat: {
    fontFamily: "Poppins_400Regular",
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
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
  },
  userName: {
    fontFamily: "Poppins_700Bold",
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
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
  },
  walletBalance: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: "#FFFFFF",
    marginTop: -2,
  },
  topUpBtn: {
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  topUpText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
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
    fontFamily: "Poppins_500Medium",
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
    fontFamily: "Poppins_600SemiBold",
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
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  okBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  okBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
});
