/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useContext, createContext, ReactNode, useMemo, useCallback } from "react"
import { Appearance, AppState, ColorSchemeName, Platform } from "react-native"
import { ThemeColors, ThemeMode } from "../types/global"
import { darkColors, lightColors } from "../styles/colors"
import { buildDynamicColors, type SystemPalette } from "../styles/dynamicColors"
import NativeLocationService from "../services/NativeLocationService"

const THEME_MODE_KEY = "themeMode"
const WALLPAPER_COLORS_KEY = "wallpaperColors"

export type ThemePreference = "system" | "light" | "dark"

/**
 * Extended theme context with additional utilities
 */
interface ThemeContextType {
  colors: ThemeColors
  mode: ThemeMode
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  toggleTheme: () => void
  isDark: boolean
  wallpaperColors: boolean
  setWallpaperColors: (enabled: boolean) => void
  /** False below API 31, where the platform has no wallpaper palette to offer. */
  wallpaperColorsAvailable: boolean
  /** Whether a palette has been read. Separate from availability, so a failed read still offers the switch. */
  wallpaperPaletteReady: boolean
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
 * - Light, dark and the wallpaper palette are separate choices, so the palette applies to all three modes
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
  const [wallpaperColors, setWallpaperColorsState] = useState(false)
  const [palette, setPalette] = useState<SystemPalette | null>(null)

  // A stored value is an explicit choice; nothing stored means the system decides.
  useEffect(() => {
    NativeLocationService.getSetting(THEME_MODE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setPreferenceState(saved)
      }
    })
    NativeLocationService.getSetting(WALLPAPER_COLORS_KEY).then((saved) => {
      if (saved === "true") setWallpaperColorsState(true)
    })
  }, [])

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(normalizeScheme(colorScheme))
    })

    return () => subscription.remove()
  }, [])

  // The palette changes with the wallpaper, which happens outside the app, so it is re-read on
  // every foreground rather than once on mount. A null answer keeps the last palette: the API
  // level cannot drop mid-process, so null after a success is a failed read, not a lost palette.
  useEffect(() => {
    const read = () =>
      NativeLocationService.getSystemPalette().then((next) => {
        if (next) setPalette(next)
      })
    read()
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") read()
    })

    return () => subscription.remove()
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    NativeLocationService.saveSetting(THEME_MODE_KEY, next)
  }, [])

  const setWallpaperColors = useCallback((enabled: boolean) => {
    setWallpaperColorsState(enabled)
    NativeLocationService.saveSetting(WALLPAPER_COLORS_KEY, String(enabled))
  }, [])

  const mode: ThemeMode = preference === "system" ? systemScheme : preference

  const colors = useMemo(() => {
    if (wallpaperColors && palette) return buildDynamicColors(palette, mode === "dark")
    return mode === "dark" ? darkColors : lightColors
  }, [mode, wallpaperColors, palette])

  const toggleTheme = useCallback(() => setPreference(mode === "dark" ? "light" : "dark"), [mode, setPreference])

  const contextValue = useMemo(
    () => ({
      colors,
      mode,
      preference,
      setPreference,
      toggleTheme,
      isDark: mode === "dark",
      wallpaperColors,
      setWallpaperColors,
      wallpaperColorsAvailable: Platform.OS === "android" && Number(Platform.Version) >= 31,
      wallpaperPaletteReady: palette !== null
    }),
    [colors, mode, preference, setPreference, wallpaperColors, setWallpaperColors, palette, toggleTheme]
  )

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}

/**
 * Hook to access theme context.
 *
 * Provides colors, mode, preference, setPreference, isDark, wallpaperColors, setWallpaperColors
 * wallpaperColorsAvailable and wallpaperPaletteReady.
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
