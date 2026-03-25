import React from "react";
import { View, Text, StyleSheet, Pressable, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";

interface SummaryCardProps {
  label: string;
  amount: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  onPrimaryAction?: () => void;
  primaryLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  style?: ViewStyle;
}

export default function SummaryCard({
  label,
  amount,
  secondaryLabel,
  secondaryValue,
  onPrimaryAction,
  primaryLabel,
  onSecondaryAction,
  secondaryActionLabel,
  style,
}: SummaryCardProps) {
  const c = useThemeColors();

  return (
    <View style={[styles.card, { backgroundColor: c.cardBg, shadowColor: c.cardShadow }, style]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.label, { color: c.textLight }]}>{label}</Text>
          <Text style={[styles.amount, { color: c.text }]}>{amount}</Text>
        </View>
        {secondaryLabel && secondaryValue && (
          <View style={styles.secondary}>
            <Text style={[styles.secondaryLabel, { color: c.textLight }]}>{secondaryLabel}</Text>
            <Text style={[styles.secondaryValue, { color: c.green }]}>{secondaryValue}</Text>
          </View>
        )}
      </View>
      {(onPrimaryAction || onSecondaryAction) && (
        <View style={styles.actionsRow}>
          {onPrimaryAction && primaryLabel && (
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.green }]}
              onPress={onPrimaryAction}
            >
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          )}
          {onSecondaryAction && secondaryActionLabel && (
            <Pressable
              style={[styles.secondaryBtn, { borderColor: c.border }]}
              onPress={onSecondaryAction}
            >
              <Text style={[styles.secondaryText, { color: c.text }]}>
                {secondaryActionLabel}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={c.text} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  amount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    marginTop: 4,
  },
  secondary: {
    alignItems: "flex-end",
  },
  secondaryLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  secondaryValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
  },
  secondaryText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
});

