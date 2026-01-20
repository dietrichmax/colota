/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, {
  useState,
  useEffect,
  useContext,
  createContext,
  ReactNode,
  useMemo,
  useCallback,
} from "react";
import { Appearance, ColorSchemeName } from "react-native";
import { ThemeColors, ThemeMode } from "../types/global";
import { darkColors, lightColors } from "../styles/colors";

/**
 * Extended theme context with additional utilities
 */
interface ThemeContextType {
  colors: ThemeColors;
  mode: ThemeMode;
  toggleTheme: () => void;
  resetToSystemTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
  isLight: boolean;
  hasManualOverride: boolean;
}

/**
 * Normalizes React Native's ColorSchemeName to ThemeMode
 */
const normalizeScheme = (
  scheme: ColorSchemeName | null | undefined
): ThemeMode => {
  return scheme === "dark" ? "dark" : "light";
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Theme provider managing theme state and system theme synchronization.
 *
 * Features:
 * - Automatically follows system theme unless manually overridden
 * - Manual theme toggle support
 * - Memoized values for optimal performance
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [hasManualOverride, setHasManualOverride] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(() =>
    normalizeScheme(Appearance.getColorScheme())
  );

  // Listen to system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (!hasManualOverride) {
        setMode(normalizeScheme(colorScheme));
      }
    });

    return () => subscription.remove();
  }, [hasManualOverride]);

  /**
   * Toggles between light and dark theme
   */
  const toggleTheme = useCallback(() => {
    setHasManualOverride(true);
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  /**
   * Resets theme to follow system preference
   */
  const resetToSystemTheme = useCallback(() => {
    setHasManualOverride(false);
    setMode(normalizeScheme(Appearance.getColorScheme()));
  }, []);

  /**
   * Sets specific theme mode
   */
  const setTheme = useCallback((newMode: ThemeMode) => {
    setHasManualOverride(true);
    setMode(newMode);
  }, []);

  const colors = useMemo(
    () => (mode === "dark" ? darkColors : lightColors),
    [mode]
  );

  const contextValue = useMemo(
    () => ({
      colors,
      mode,
      toggleTheme,
      resetToSystemTheme,
      setTheme,
      isDark: mode === "dark",
      isLight: mode === "light",
      hasManualOverride,
    }),
    [colors, mode, hasManualOverride, toggleTheme, resetToSystemTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to access theme context.
 *
 * Provides colors, mode, toggleTheme, resetToSystemTheme, setTheme,
 * isDark, isLight, and hasManualOverride.
 *
 * @throws If used outside ThemeProvider
 *
 * @example
 * ```tsx
 * const { colors, mode, toggleTheme } = useTheme();
 * <View style={{ backgroundColor: colors.background }}>
 *   <Button onPress={toggleTheme} title="Toggle Theme" />
 * </View>
 * ```
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

/**
 * Gets a specific color from the current theme.
 *
 * @example
 * ```tsx
 * const primaryColor = useThemeColor('primary');
 * ```
 */
export const useThemeColor = <K extends keyof ThemeColors>(
  colorKey: K
): ThemeColors[K] => {
  const { colors } = useTheme();
  return colors[colorKey];
};

/**
 * Returns different values based on current theme mode.
 *
 * @example
 * ```tsx
 * const padding = useThemedValue(16, 20);
 * const icon = useThemedValue('☀️', '🌙');
 * ```
 */
export const useThemedValue = <T,>(lightValue: T, darkValue: T): T => {
  const { isDark } = useTheme();
  return isDark ? darkValue : lightValue;
};
