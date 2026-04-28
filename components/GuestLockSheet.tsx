import React from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";

interface GuestLockSheetProps {
  visible: boolean;
  title: string;
  message: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onCreateAccount: () => void;
  onSignIn?: () => void;
  onDismiss: () => void;
}

export default function GuestLockSheet({
  visible,
  title,
  message,
  icon = "lock-closed-outline",
  onCreateAccount,
  onSignIn,
  onDismiss,
}: GuestLockSheetProps) {
  const c = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={[styles.overlay, { backgroundColor: c.modalOverlay }]} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: c.cardBg }]} onPress={() => {}}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          <View style={[styles.iconWrap, { backgroundColor: c.green + "1A" }]}>
            <Ionicons name={icon} size={36} color={c.green} />
          </View>

          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          <Text style={[styles.message, { color: c.textMuted }]}>{message}</Text>

          <Pressable style={[styles.primaryBtn, { backgroundColor: c.green }]} onPress={onCreateAccount}>
            <Text style={styles.primaryBtnText}>Create Account</Text>
          </Pressable>

          {onSignIn ? (
            <Pressable style={[styles.secondaryBtn, { borderColor: c.border }]} onPress={onSignIn}>
              <Text style={[styles.secondaryBtnText, { color: c.textMuted }]}>Sign in</Text>
            </Pressable>
          ) : null}

          <Pressable style={[styles.secondaryBtn, { borderColor: c.border }]} onPress={onDismiss}>
            <Text style={[styles.secondaryBtnText, { color: c.textMuted }]}>Maybe later</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 28,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  secondaryBtn: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 15,
  },
});
