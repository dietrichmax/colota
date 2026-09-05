/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 *
 * Single source of truth for all Colota theme colors.
 * Used by: apps/mobile, apps/docs
 */

export type ThemeMode = "light" | "dark"

export interface ThemeColors {
  // Primary colors
  primary: string
  primaryDark: string

  // Secondary colors

  // Semantic colors
  success: string
  warning: string
  error: string
  info: string

  // Surfaces & backgrounds
  background: string
  backgroundElevated: string
  card: string
  cardElevated: string
  surface: string

  // Text colors
  text: string
  textSecondary: string
  textLight: string
  textDisabled: string

  // Borders & dividers
  border: string
  borderLight: string
  divider: string

  // Interactive elements
  placeholder: string
  link: string

  // Utility
  overlay: string
  pressedOpacity: number
  borderRadius: number
  textOnPrimary: string
}

export const lightColors: ThemeColors = {
  // Brand (Teal)
  primary: "#0d9488",
  primaryDark: "#115E59",

  // Status
  success: "#2E7D32",
  warning: "#C2410C",
  error: "#D32F2F",
  info: "#1976D2",

  // UI
  background: "#f8fafb",
  backgroundElevated: "#FFFFFF",
  card: "#FFFFFF",
  cardElevated: "#FFFFFF",
  surface: "#FFFFFF",

  // Text
  text: "#202124",
  textSecondary: "#5F6368",
  textLight: "#9AA0A6",
  textDisabled: "#9AA0A6",

  // Border & divider
  border: "#e5e7eb",
  borderLight: "#f3f4f6",
  divider: "#e5e7eb",

  // Interactive
  placeholder: "#9AA0A6",
  link: "#115E59",
  overlay: "rgba(0, 0, 0, 0.5)",

  // Special
  pressedOpacity: 0.7,
  borderRadius: 8,
  textOnPrimary: "#FFFFFF"
}

export const darkColors: ThemeColors = {
  // Brand (Teal)
  primary: "#2DD4BF",
  primaryDark: "#0d9488",

  // Status
  success: "#4CAF50",
  warning: "#FB923C",
  error: "#EF5350",
  info: "#4285F4",

  // UI
  background: "#121212",
  backgroundElevated: "#1E1E1E",
  card: "#2D2D2D",
  cardElevated: "#3D3D3D",
  surface: "#1E1E1E",

  // Text
  text: "#E8EAED",
  textSecondary: "#AAAAAA",
  textLight: "#888888",
  textDisabled: "#666666",

  // Border & divider
  border: "#424242",
  borderLight: "#333333",
  divider: "#333333",

  // Interactive
  placeholder: "#AAAAAA",
  link: "#2DD4BF",
  overlay: "rgba(0, 0, 0, 0.7)",

  // Special
  pressedOpacity: 0.7,
  borderRadius: 8,
  textOnPrimary: "#121212"
}
