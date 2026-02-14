/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { TextStyle } from "react-native"

export const fonts: Record<string, Pick<TextStyle, "fontFamily">> = {
  regular: { fontFamily: "Inter-Regular" },
  medium: { fontFamily: "Inter-Medium" },
  semiBold: { fontFamily: "Inter-SemiBold" },
  bold: { fontFamily: "Inter-Bold" }
}

/**
 * Centralized type scale — single source of truth for font sizes.
 *
 * screenTitle  28  Screen headers (bold)
 * statValue    24  Large numeric displays (bold)
 * cardTitle    20  Card/section headers (bold)
 * heading      18  Sub-headings (semiBold)
 * label        16  Settings labels, button text, primary UI text (semiBold/medium)
 * input        15  Text inputs, field labels (medium/regular)
 * body         14  Body text, subtitles, descriptions (regular)
 * description  13  Secondary descriptions, hints (regular/medium)
 * caption      12  Captions, small hints, chip text (medium/regular)
 * small        11  Section titles, footnotes (semiBold/regular)
 * micro        10  Uppercase badges, coordinate labels (semiBold/bold)
 */
export const fontSizes = {
  screenTitle: 28,
  statValue: 24,
  cardTitle: 20,
  heading: 18,
  label: 16,
  input: 15,
  body: 14,
  description: 13,
  caption: 12,
  small: 11,
  micro: 10
} as const
