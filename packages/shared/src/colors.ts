/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 *
 * Single source of truth for all Colota theme colors.
 * Used by: apps/mobile, apps/docs
 */

export type ThemeMode = "light" | "dark"

export interface ThemeColors {
  // Brand
  primary: string
  primaryDark: string
  primaryContainer: string
  onPrimaryContainer: string

  // Semantic hues
  success: string
  warning: string
  error: string
  info: string

  // Surfaces
  background: string
  card: string
  cardElevated: string
  well: string

  // Text
  text: string
  textSecondary: string
  textLight: string
  textDisabled: string

  // Lines
  border: string
  outline: string

  // Inverse pair
  inverseSurface: string
  inverseOnSurface: string

  // Interactive
  placeholder: string
  link: string
  overlay: string
  textOnPrimary: string
  pressedOpacity: number

  // Aliases kept for their remaining consumers; deleted once every screen has migrated.
  backgroundElevated: string
  surface: string
  borderLight: string
  divider: string
  borderRadius: number
}

export const lightColors: ThemeColors = {
  primary: "#0A7369",
  primaryDark: "#084F48",
  primaryContainer: "#D2EBE6",
  onPrimaryContainer: "#084F48",

  success: "#2E6B34",
  warning: "#A63E0A",
  error: "#C0392B",
  info: "#1F5FA8",

  background: "#F4F4F2",
  card: "#FFFFFF",
  cardElevated: "#FFFFFF",
  well: "#E6E6E3",

  text: "#1B1B1A",
  textSecondary: "#52524F",
  textLight: "#676763",
  textDisabled: "#A2A29E",

  border: "#DCDCD8",
  outline: "#838380",

  inverseSurface: "#2C2C2A",
  inverseOnSurface: "#F4F4F2",

  placeholder: "#676763",
  link: "#084F48",
  overlay: "rgba(0, 0, 0, 0.5)",
  textOnPrimary: "#FFFFFF",
  pressedOpacity: 0.7,

  backgroundElevated: "#FFFFFF",
  surface: "#FFFFFF",
  borderLight: "#DCDCD8",
  divider: "#DCDCD8",
  borderRadius: 8
}

export const darkColors: ThemeColors = {
  primary: "#2FC4B0",
  primaryDark: "#1FA895",
  primaryContainer: "#103F3A",
  onPrimaryContainer: "#9FE3D8",

  success: "#7BC47F",
  warning: "#F0A050",
  error: "#F07A70",
  info: "#6FA8E8",

  background: "#131313",
  card: "#1E1E1E",
  cardElevated: "#282828",
  well: "#222222",

  text: "#EAEAE7",
  textSecondary: "#B0B0AC",
  textLight: "#94948F",
  textDisabled: "#5E5E5B",

  border: "#2A2A2A",
  outline: "#7A7A76",

  inverseSurface: "#EAEAE7",
  inverseOnSurface: "#131313",

  placeholder: "#94948F",
  link: "#2FC4B0",
  overlay: "rgba(0, 0, 0, 0.65)",
  textOnPrimary: "#121212",
  pressedOpacity: 0.7,

  backgroundElevated: "#1E1E1E",
  surface: "#1E1E1E",
  borderLight: "#2A2A2A",
  divider: "#2A2A2A",
  borderRadius: 8
}
