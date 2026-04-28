import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

export default function CampaignLinkForwarder() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    const cid = typeof id === "string" ? id : Array.isArray(id) ? id[0] : undefined;
    if (cid) {
      router.replace({ pathname: "/campaign/[id]", params: { id: cid } });
    } else {
      router.replace("/(tabs)");
    }
  }, [id]);

  return <View />;
}

