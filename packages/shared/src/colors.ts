/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

export type ThemeMode = "light" | "dark"

// Material's pressed state layer: 10 percent of the element's own content colour, appended to a hex token.
export const STATE_LAYER_ALPHA = "1A"

export interface ThemeColors {
  primary: string
  primaryDark: string
  primaryContainer: string
  onPrimaryContainer: string
  border: string
  well: string

  success: string
  warning: string
  error: string
  info: string

  background: string
  backgroundElevated: string
  card: string
  /** Docks, dialogs, banners and map discs: what floats over content. Never a list card. */
  surfaceRaised: string
  surface: string

  text: string
  textSecondary: string
  textLight: string
  textDisabled: string

  borderLight: string
  divider: string

  placeholder: string
  link: string

  overlay: string
  textOnPrimary: string
}

export const lightColors: ThemeColors = {
  primary: "#0B7D73",
  primaryDark: "#115E59",
  primaryContainer: "#B9E4DC",
  onPrimaryContainer: "#115E59",
  well: "#E9EDF0",

  success: "#2E7D32",
  warning: "#C2410C",
  error: "#D32F2F",
  info: "#1870C8",

  background: "#F1F4F6",
  backgroundElevated: "#FFFFFF",
  card: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surface: "#FFFFFF",

  text: "#202124",
  textSecondary: "#5F6368",
  textLight: "#697077",
  textDisabled: "#9AA0A6",

  border: "#7e889c",
  borderLight: "#f3f4f6",
  divider: "#e5e7eb",

  placeholder: "#9AA0A6",
  link: "#115E59",
  overlay: "rgba(0, 0, 0, 0.5)",

  textOnPrimary: "#FFFFFF"
}

export const darkColors: ThemeColors = {
  primary: "#2DD4BF",
  primaryDark: "#0FA698",
  primaryContainer: "#0F3B36",
  onPrimaryContainer: "#99F6E4",
  well: "#232323",

  success: "#4CAF50",
  warning: "#FB923C",
  error: "#F16765",
  info: "#5793F5",

  background: "#121212",
  backgroundElevated: "#1E1E1E",
  card: "#2D2D2D",
  surfaceRaised: "#353535",
  surface: "#1E1E1E",

  text: "#E8EAED",
  textSecondary: "#AAAAAA",
  textLight: "#949494",
  textDisabled: "#666666",

  border: "#767676",
  borderLight: "#333333",
  divider: "#505050",

  placeholder: "#AAAAAA",
  link: "#2DD4BF",
  overlay: "rgba(0, 0, 0, 0.7)",

  textOnPrimary: "#121212"
}
