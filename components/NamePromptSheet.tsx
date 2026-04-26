import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useThemeColors } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

export default function NamePromptSheet() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { needsDisplayName, saveDisplayName, dismissDisplayNamePrompt } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (needsDisplayName) {
      setName("");
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start(() => {
        setTimeout(() => inputRef.current?.focus(), 100);
      });
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [needsDisplayName, slideAnim]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveDisplayName(trimmed);
    } finally {
      setSaving(false);
    }
  }

  if (!needsDisplayName) return null;

  return (
    <Modal
      visible={needsDisplayName}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.backdrop} onPress={dismissDisplayNamePrompt} />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: c.cardBg,
              paddingBottom: insets.bottom + 24,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          <Text style={[styles.title, { color: c.text }]}>What's your name?</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            Apple didn't share your name with us. Add it so people know who you are.
          </Text>

          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                backgroundColor: c.background,
                borderColor: c.border,
                color: c.text,
              },
            ]}
            placeholder="Full name"
            placeholderTextColor={c.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <Pressable
            style={[
              styles.saveBtn,
              { backgroundColor: Colors.green, opacity: !name.trim() || saving ? 0.5 : 1 },
            ]}
            onPress={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>

          <Pressable style={styles.skipBtn} onPress={dismissDisplayNamePrompt}>
            <Text style={[styles.skipText, { color: c.textMuted }]}>Skip for now</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 16,
    marginBottom: 14,
  },
  saveBtn: {
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  saveBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.white,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
  },
});
