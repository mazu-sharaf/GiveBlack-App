const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const GREEN = "#2D9E6B";
const CREAM = "#FAF8F4";
const WHITE = "#FFFFFF";

export interface ThemeColors {
  primary: string;
  gold: string;
  green: string;
  cream: string;
  white: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  textLight: string;
  border: string;
  cardShadow: string;
  inputBg: string;
  headerBg: string;
  tabBarBg: string;
  cardBg: string;
  modalOverlay: string;
  walletBg: string;
  successBg: string;
  errorBg: string;
  sliderInactive: string;
}

export const lightTheme: ThemeColors = {
  primary: BLACK,
  gold: GOLD,
  green: GREEN,
  cream: CREAM,
  white: WHITE,
  background: CREAM,
  surface: WHITE,
  text: BLACK,
  textMuted: "#6B6B6B",
  textLight: "#9B9B9B",
  border: "#EBEBEB",
  cardShadow: "rgba(0,0,0,0.08)",
  inputBg: "#F1F1F1",
  headerBg: WHITE,
  tabBarBg: WHITE,
  cardBg: WHITE,
  modalOverlay: "rgba(0,0,0,0.4)",
  walletBg: GREEN,
  successBg: "#E8F5E9",
  errorBg: "#FFEBEE",
  sliderInactive: "#BBBBBB",
};

export const darkTheme: ThemeColors = {
  primary: "#F5F5F5",
  gold: "#E8C547",
  green: "#3DBB7F",
  cream: "#121212",
  white: "#1E1E1E",
  background: "#121212",
  surface: "#1E1E1E",
  text: "#F5F5F5",
  textMuted: "#A0A0A0",
  textLight: "#6B6B6B",
  border: "#2E2E2E",
  cardShadow: "rgba(0,0,0,0.3)",
  inputBg: "#2A2A2A",
  headerBg: "#121212",
  tabBarBg: "#1A1A1A",
  cardBg: "#1E1E1E",
  modalOverlay: "rgba(0,0,0,0.6)",
  walletBg: "#1B5E3B",
  successBg: "#1B3A26",
  errorBg: "#3A1B1B",
  sliderInactive: "#2E2E2E",
};

const Colors = {
  primary: BLACK,
  gold: GOLD,
  green: GREEN,
  cream: CREAM,
  white: WHITE,
  background: CREAM,
  surface: WHITE,
  text: BLACK,
  textMuted: "#6B6B6B",
  textLight: "#9B9B9B",
  border: "#EBEBEB",
  cardShadow: "rgba(0,0,0,0.08)",
  inputBg: "#F1F1F1",
  headerBg: WHITE,
  tabBarBg: WHITE,
  cardBg: WHITE,
  modalOverlay: "rgba(0,0,0,0.4)",
  walletBg: GREEN,
  successBg: "#E8F5E9",
  errorBg: "#FFEBEE",
  sliderInactive: "#BBBBBB",
  light: {
    text: BLACK,
    background: CREAM,
    tint: BLACK,
    tabIconDefault: "#9B9B9B",
    tabIconSelected: BLACK,
  },
};

export default Colors;
