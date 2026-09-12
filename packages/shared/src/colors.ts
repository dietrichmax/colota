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
  primaryContainer: string
  onPrimaryContainer: string
  border: string
  well: string

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
  /** One tonal step above `card` for what floats over content: docks, dialogs, banners, map discs. Never a list card. */
  surfaceRaised: string
  surface: string

  // Text colors
  text: string
  textSecondary: string
  textLight: string
  textDisabled: string

  // Borders & dividers
  borderLight: string
  divider: string

  // Interactive elements
  placeholder: string
  link: string

  // Utility
  overlay: string
  textOnPrimary: string
}

export const lightColors: ThemeColors = {
  // Brand (Teal)
  primary: "#0B7D73",
  primaryDark: "#115E59",
  primaryContainer: "#B9E4DC",
  onPrimaryContainer: "#115E59",
  well: "#E9EDF0",

  // Status
  success: "#2E7D32",
  warning: "#C2410C",
  error: "#D32F2F",
  info: "#1870C8",

  // UI
  background: "#F1F4F6",
  backgroundElevated: "#FFFFFF",
  card: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surface: "#FFFFFF",

  // Text
  text: "#202124",
  textSecondary: "#5F6368",
  textLight: "#697077",
  textDisabled: "#9AA0A6",

  // Border & divider
  border: "#7e889c",
  borderLight: "#f3f4f6",
  divider: "#e5e7eb",

  // Interactive
  placeholder: "#9AA0A6",
  link: "#115E59",
  overlay: "rgba(0, 0, 0, 0.5)",

  // Special
  textOnPrimary: "#FFFFFF"
}

export const darkColors: ThemeColors = {
  // Brand (Teal)
  primary: "#2DD4BF",
  primaryDark: "#0FA698",
  primaryContainer: "#0F3B36",
  onPrimaryContainer: "#99F6E4",
  well: "#232323",

  // Status
  success: "#4CAF50",
  warning: "#FB923C",
  error: "#F16765",
  info: "#5793F5",

  // UI
  background: "#121212",
  backgroundElevated: "#1E1E1E",
  card: "#2D2D2D",
  surfaceRaised: "#353535",
  surface: "#1E1E1E",

  // Text
  text: "#E8EAED",
  textSecondary: "#AAAAAA",
  textLight: "#949494",
  textDisabled: "#666666",

  // Border & divider
  border: "#767676",
  borderLight: "#333333",
  divider: "#505050",

  // Interactive
  placeholder: "#AAAAAA",
  link: "#2DD4BF",
  overlay: "rgba(0, 0, 0, 0.7)",

  // Special
  textOnPrimary: "#121212"
}
