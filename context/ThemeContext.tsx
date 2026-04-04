import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useColorScheme, Appearance, type ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lightTheme, darkTheme, ThemeColors } from "@/constants/colors";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  isDark: false,
  colors: lightTheme,
  setTheme: () => {},
  toggleTheme: () => {},
});

const THEME_STORAGE_KEY = "@gb_theme_mode";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const hookScheme = useColorScheme();
  const [appearanceScheme, setAppearanceScheme] = useState<ColorSchemeName>(() => Appearance.getColorScheme());

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setAppearanceScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  // useColorScheme() can be null briefly; fall back to Appearance, then light.
  const systemResolved: "light" | "dark" =
    (hookScheme ?? appearanceScheme ?? "light") === "dark" ? "dark" : "light";

  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const isDark = theme === "dark" || (theme === "system" && systemResolved === "dark");
  const colors = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
