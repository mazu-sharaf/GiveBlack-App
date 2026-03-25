import React, { useState } from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";

interface OrgAvatarProps {
  imageUrl?: string;
  thumbnailUrl?: string;
  initials: string;
  imageColor: string;
  size?: number;
  fontSize?: number;
}

export default function OrgAvatar({
  imageUrl,
  thumbnailUrl,
  initials,
  imageColor,
  size = 48,
  fontSize,
}: OrgAvatarProps) {
  const src = thumbnailUrl || imageUrl;
  const borderRadius = size / 2;
  const autoFontSize = fontSize ?? Math.max(10, Math.floor(size * 0.33));
  const displayInitials = initials?.trim() || "?";
  const bgColor = imageColor || "#37474F";
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <Image
        source={{ uri: src }}
        style={{
          width: size,
          height: size,
          borderRadius,
        }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius,
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: "Poppins_700Bold",
          fontSize: autoFontSize,
          color: "#FFFFFF",
          letterSpacing: 0.5,
        }}
      >
        {displayInitials}
      </Text>
    </View>
  );
}
