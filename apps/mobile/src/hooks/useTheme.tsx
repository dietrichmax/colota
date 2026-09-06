/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useContext, createContext, ReactNode, useMemo, useCallback } from "react"
import { Appearance, ColorSchemeName } from "react-native"
import { ThemeColors, ThemeMode } from "../types/global"
import { darkColors, lightColors } from "../styles/colors"
import NativeLocationService from "../services/NativeLocationService"

const THEME_MODE_KEY = "themeMode"

export type ThemePreference = "system" | "light" | "dark"

/**
 * Extended theme context with additional utilities
 */
interface ThemeContextType {
  colors: ThemeColors
  mode: ThemeMode
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  isDark: boolean
}

/**
 * Normalizes React Native's ColorSchemeName to ThemeMode
 */
const normalizeScheme = (scheme: ColorSchemeName | null | undefined): ThemeMode => {
  return scheme === "dark" ? "dark" : "light"
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

/**
 * Theme provider managing theme state and system theme synchronization.
 *
 * Features:
 * - Follows the system scheme until the user picks light or dark
 * - The choice persists; picking "system" hands control back
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
  const [preference, setPreferenceState] = useState<ThemePreference>("system")
  const [systemScheme, setSystemScheme] = useState<ThemeMode>(() => normalizeScheme(Appearance.getColorScheme()))

  // A stored value is an explicit choice; nothing stored means the system decides.
  useEffect(() => {
    NativeLocationService.getSetting(THEME_MODE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setPreferenceState(saved)
      }
    })
  }, [])

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(normalizeScheme(colorScheme))
    })

    return () => subscription.remove()
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    NativeLocationService.saveSetting(THEME_MODE_KEY, next)
  }, [])

  const mode: ThemeMode = preference === "system" ? systemScheme : preference

  const colors = useMemo(() => (mode === "dark" ? darkColors : lightColors), [mode])

  const contextValue = useMemo(
    () => ({
      colors,
      mode,
      preference,
      setPreference,
      isDark: mode === "dark"
    }),
    [colors, mode, preference, setPreference]
  )

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}

/**
 * Hook to access theme context.
 *
 * Provides colors, mode, preference, setPreference and isDark.
 *
 * @throws If used outside ThemeProvider
 *
 * @example
 * ```tsx
 * const { colors, mode, setPreference } = useTheme();
 * <View style={{ backgroundColor: colors.background }}>
 *   <Button onPress={() => setPreference("dark")} title="Dark" />
 * </View>
 * ```
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
