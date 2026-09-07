/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { ThemeColors } from "../types/global"
import { darkColors, lightColors } from "./colors"

// The steps BuildConfigModule.getSystemPalette returns. Android numbers them the other way round
// from Material tone: 0 is the lightest step and 900 the darkest.
const PALETTE_STEPS = [
  "accent1_100",
  "accent1_200",
  "accent1_300",
  "accent1_600",
  "accent1_700",
  "accent1_800",
  "accent1_900",
  "neutral1_0",
  "neutral1_50",
  "neutral1_600",
  "neutral1_700",
  "neutral1_800",
  "neutral1_900",
  "neutral2_100",
  "neutral2_200",
  "neutral2_300",
  "neutral2_400",
  "neutral2_500",
  "neutral2_600",
  "neutral2_700",
  "neutral2_800"
] as const

export type SystemPalette = Record<(typeof PALETTE_STEPS)[number], string>

const HEX = /^#[0-9A-Fa-f]{6}$/

/**
 * A palette missing a step would put `undefined` into a style prop, so a partial map is no palette
 * at all and the caller keeps the brand colours.
 */
export function parseSystemPalette(raw: unknown): SystemPalette | null {
  if (!raw || typeof raw !== "object") return null
  const map = raw as Record<string, unknown>
  for (const step of PALETTE_STEPS) {
    if (typeof map[step] !== "string" || !HEX.test(map[step] as string)) return null
  }
  return map as SystemPalette
}

/**
 * Maps the wallpaper palette onto the theme. Status colours are never mapped: an error stays red
 * whatever the wallpaper is. Text is paired with its surface by tone, so contrast does not depend
 * on which hue the wallpaper produced.
 */
export function buildDynamicColors(palette: SystemPalette, isDark: boolean): ThemeColors {
  const base = isDark ? darkColors : lightColors
  const fixed = {
    success: base.success,
    warning: base.warning,
    error: base.error,
    info: base.info,
    overlay: base.overlay
  }

  if (isDark) {
    return {
      ...fixed,
      primary: palette.accent1_200,
      primaryDark: palette.accent1_300,
      primaryContainer: palette.accent1_800,
      onPrimaryContainer: palette.accent1_100,
      well: palette.neutral1_800,
      background: palette.neutral1_900,
      backgroundElevated: palette.neutral1_800,
      card: palette.neutral1_700,
      cardElevated: palette.neutral1_600,
      surface: palette.neutral1_800,
      text: palette.neutral1_50,
      textSecondary: palette.neutral2_200,
      textLight: palette.neutral2_300,
      textDisabled: palette.neutral2_400,
      border: palette.neutral2_700,
      borderLight: palette.neutral2_800,
      divider: palette.neutral2_700,
      placeholder: palette.neutral2_400,
      link: palette.accent1_200,
      textOnPrimary: palette.neutral1_900
    }
  }

  return {
    ...fixed,
    primary: palette.accent1_600,
    primaryDark: palette.accent1_700,
    primaryContainer: palette.accent1_100,
    onPrimaryContainer: palette.accent1_900,
    well: palette.neutral2_100,
    background: palette.neutral1_50,
    backgroundElevated: palette.neutral1_0,
    card: palette.neutral1_0,
    cardElevated: palette.neutral1_0,
    surface: palette.neutral1_0,
    text: palette.neutral1_900,
    textSecondary: palette.neutral2_700,
    textLight: palette.neutral2_600,
    textDisabled: palette.neutral2_500,
    border: palette.neutral2_200,
    borderLight: palette.neutral2_100,
    divider: palette.neutral2_200,
    placeholder: palette.neutral2_500,
    link: palette.accent1_700,
    textOnPrimary: palette.neutral1_0
  }
}
