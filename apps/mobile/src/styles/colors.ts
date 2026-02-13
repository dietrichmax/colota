/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { ThemeColors } from "../types/global"

export const lightColors: ThemeColors = {
  // Brand (Deep Indigo for trust and uniqueness)
  primary: "#7986CB",
  primaryDark: "#1A237E",
  primaryLight: "#C5CAE9",
  secondary: "#FF7043",
  secondaryDark: "#E64A19",
  secondaryLight: "#FFCCBC",

  // Status (WCAG compliant)
  success: "#2E7D32",
  successDark: "#1B5E20",
  successLight: "#A5D6A7",
  warning: "#FF9800",
  warningDark: "#F57C00",
  warningLight: "#FFE0B2",
  error: "#D32F2F",
  errorDark: "#B71C1C",
  errorLight: "#FFCDD2",
  info: "#1976D2",
  infoDark: "#0D47A1",
  infoLight: "#BBDEFB",

  // UI (optimized for maps)
  background: "#FAFAFA",
  backgroundElevated: "#FFFFFF",
  card: "#FFFFFF",
  cardElevated: "#FFFFFF",
  surface: "#FFFFFF",

  // Text (WCAG AAA)
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
  link: "#5C6BC0",
  linkVisited: "#7986CB",
  overlay: "rgba(0, 0, 0, 0.5)",
  shadow: "rgba(0, 0, 0, 0.1)",

  // Special
  transparent: "transparent",
  borderRadius: 8
}

export const darkColors: ThemeColors = {
  // Brand
  primary: "#7986CB",
  primaryDark: "#303F9F",
  primaryLight: "#C5CAE9",
  secondary: "#FF9800",
  secondaryDark: "#F57C00",
  secondaryLight: "#FFE0B2",

  // Status
  success: "#4CAF50",
  successDark: "#388E3C",
  successLight: "#C8E6C9",
  warning: "#FF9800",
  warningDark: "#F57C00",
  warningLight: "#FFE0B2",
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
  link: "#9FA8DA",
  linkVisited: "#7986CB",
  overlay: "rgba(0, 0, 0, 0.7)",
  shadow: "rgba(0, 0, 0, 0.3)",

  // Special
  transparent: "transparent",
  borderRadius: 8
}
