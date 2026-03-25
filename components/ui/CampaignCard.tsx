import React from "react";
import { View, Text, StyleSheet, Pressable, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/ThemeContext";
import { getCampaignImage } from "@/constants/images";

interface CampaignCardProps {
  id: string;
  title: string;
  orgName?: string;
  mainImageUrl?: string | null;
  raised: number;
  goal: number;
  donors?: number;
  index?: number;
  compact?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onPress?: () => void;
  style?: ViewStyle;
}

export default function CampaignCard({
  id,
  title,
  orgName,
  mainImageUrl,
  raised,
  goal,
  donors,
  index = 0,
  compact,
  isFavorite,
  onToggleFavorite,
  onPress,
  style,
}: CampaignCardProps) {
  const c = useThemeColors();
  const pct = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;
  const imageSource = mainImageUrl
    ? { uri: mainImageUrl }
    : getCampaignImage(index);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: c.cardBg, shadowColor: c.cardShadow },
        compact && styles.cardCompact,
        style,
      ]}
    >
      <View style={[styles.imageWrap, compact && styles.imageWrapCompact]}>
        <Image
          source={imageSource}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={id}
          transition={200}
          placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
        />
        {onToggleFavorite && (
          <Pressable
            style={styles.heartBtn}
            onPress={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={compact ? 16 : 18}
              color={isFavorite ? c.green : "#FFFFFF"}
            />
          </Pressable>
        )}
      </View>
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: c.text }]}
          numberOfLines={compact ? 1 : 2}
        >
          {title}
        </Text>
        {orgName && (
          <Text
            style={[styles.orgName, { color: c.textMuted }]}
            numberOfLines={1}
          >
            {orgName}
          </Text>
        )}
        <View
          style={[styles.progressBar, { backgroundColor: c.border }]}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${pct}%`, backgroundColor: c.green },
            ]}
          />
        </View>
        <View style={styles.footerRow}>
          <Text style={[styles.raisedText, { color: c.text }]}>
            ${raised.toLocaleString()}{" "}
            <Text style={[styles.goalText, { color: c.textMuted }]}>
              / ${goal.toLocaleString()}
            </Text>
          </Text>
          {typeof donors === "number" && (
            <Text style={[styles.donorsText, { color: c.textMuted }]}>
              {donors} donors
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardCompact: {
    flexDirection: "row",
  },
  imageWrap: {
    width: "100%",
    height: 160,
    position: "relative",
  },
  imageWrapCompact: {
    width: 110,
    height: 110,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  heartBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 14,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    marginBottom: 4,
  },
  orgName: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  raisedText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  goalText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  donorsText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
});

