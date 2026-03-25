import { Platform } from "react-native";
import { useSafeAreaInsets as useRNSafeAreaInsets } from "react-native-safe-area-context";

const WEB_BOTTOM_INSET = 34;

export function useSafeInsets() {
  const insets = useRNSafeAreaInsets();
  return {
    top: insets.top,
    bottom: Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom,
    left: insets.left,
    right: insets.right,
  };
}
