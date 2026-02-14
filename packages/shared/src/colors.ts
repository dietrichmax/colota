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
  primaryLight: string

  // Secondary colors
  secondary: string
  secondaryDark: string
  secondaryLight: string

  // Semantic colors
  success: string
  successDark: string
  successLight: string
  warning: string
  warningDark: string
  warningLight: string
  error: string
  errorDark: string
  errorLight: string
  info: string
  infoDark: string
  infoLight: string

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
  linkVisited: string

  // Utility
  overlay: string
  shadow: string
  transparent: string
  borderRadius: number
  textOnPrimary: string
}

export const lightColors: ThemeColors = {
  // Brand (Teal)
  primary: "#0d9488",
  primaryDark: "#115E59",
  primaryLight: "#99F6E4",
  secondary: "#F59E0B",
  secondaryDark: "#92400E",
  secondaryLight: "#FDE68A",

  // Status
  success: "#2E7D32",
  successDark: "#1B5E20",
  successLight: "#A5D6A7",
  warning: "#C2410C",
  warningDark: "#9A3412",
  warningLight: "#FED7AA",
  error: "#D32F2F",
  errorDark: "#B71C1C",
  errorLight: "#FFCDD2",
  info: "#1976D2",
  infoDark: "#0D47A1",
  infoLight: "#BBDEFB",

  // UI
  background: "#FAFAFA",
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
  border: "#DADCE0",
  borderLight: "#E0E0E0",
  divider: "#E0E0E0",

  // Interactive
  placeholder: "#9AA0A6",
  link: "#115E59",
  linkVisited: "#134E4A",
  overlay: "rgba(0, 0, 0, 0.5)",
  shadow: "rgba(0, 0, 0, 0.1)",

  // Special
  transparent: "transparent",
  borderRadius: 8,
  textOnPrimary: "#FFFFFF"
}

export const darkColors: ThemeColors = {
  // Brand (Teal)
  primary: "#2DD4BF",
  primaryDark: "#0d9488",
  primaryLight: "#99F6E4",
  secondary: "#FBBF24",
  secondaryDark: "#F59E0B",
  secondaryLight: "#FDE68A",

  // Status
  success: "#4CAF50",
  successDark: "#388E3C",
  successLight: "#C8E6C9",
  warning: "#FB923C",
  warningDark: "#F97316",
  warningLight: "#FED7AA",
  error: "#EF5350",
  errorDark: "#D32F2F",
  errorLight: "#FFCDD2",
  info: "#4285F4",
  infoDark: "#1976D2",
  infoLight: "#BBDEFB",

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
  linkVisited: "#14B8A6",
  overlay: "rgba(0, 0, 0, 0.7)",
  shadow: "rgba(0, 0, 0, 0.3)",

  // Special
  transparent: "transparent",
  borderRadius: 8,
  textOnPrimary: "#121212"
}
