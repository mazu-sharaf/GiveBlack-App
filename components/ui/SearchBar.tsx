import React from "react";
import { View, TextInput, StyleSheet, ActivityIndicator, Pressable, TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";

interface Props extends TextInputProps {
  loading?: boolean;
  onClear?: () => void;
}

export default function SearchBar({ loading, onClear, style, ...inputProps }: Props) {
  const c = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.inputBg, borderColor: c.border },
        style,
      ]}
    >
      <Ionicons
        name="search-outline"
        size={18}
        color={c.textMuted}
        style={styles.icon}
      />
      <TextInput
        {...inputProps}
        style={[styles.input, { color: c.text }]}
        placeholderTextColor={c.textMuted}
      />
      {loading && <ActivityIndicator size="small" color={c.textMuted} />}
      {!loading && inputProps.value && String(inputProps.value).length > 0 && onClear && (
        <Pressable onPress={onClear} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={c.textLight} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  icon: {
    marginLeft: 4,
  },
  input: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 15,
  },
});

