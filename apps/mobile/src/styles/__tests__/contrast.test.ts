/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { lightColors, darkColors } from "@colota/shared"
import type { ThemeColors } from "@colota/shared"

// WCAG 2.x relative luminance and contrast ratio, computed from the tokens so an
// edit to a hex value fails here instead of shipping an unreadable screen.
function luminance(hex: string): number {
  const h = hex.replace("#", "")
  const channels = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

type Pair = [keyof ThemeColors, keyof ThemeColors]

// AA for text: anything the user reads at body size or smaller.
const TEXT_PAIRS: Pair[] = [
  ["text", "background"],
  ["text", "card"],
  ["textSecondary", "background"],
  ["textSecondary", "cardElevated"],
  ["textLight", "background"],
  ["primary", "background"],
  ["link", "background"],
  ["success", "background"],
  ["warning", "background"],
  ["error", "background"],
  ["info", "background"],
  ["textOnPrimary", "primary"],
  ["textOnPrimary", "error"],
  ["onPrimaryContainer", "primaryContainer"],
  ["inverseOnSurface", "inverseSurface"]
]

// AA for non-text: a boundary the user has to see to work the control.
const COMPONENT_PAIRS: Pair[] = [
  ["outline", "background"],
  ["outline", "well"],
  ["primary", "primaryContainer"]
]

const THEMES: [string, ThemeColors][] = [
  ["light", lightColors],
  ["dark", darkColors]
]

describe("token contrast", () => {
  describe.each(THEMES)("%s", (_mode, colors) => {
    it.each(TEXT_PAIRS)("%s on %s clears 4.5:1, the AA floor for readable text", (fg, bg) => {
      expect(contrast(colors[fg] as string, colors[bg] as string)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(COMPONENT_PAIRS)("%s on %s clears 3:1, the AA floor for a control boundary", (fg, bg) => {
      expect(contrast(colors[fg] as string, colors[bg] as string)).toBeGreaterThanOrEqual(3)
    })
  })

  // textDisabled is exempt by design: WCAG excludes disabled controls, and lifting it
  // to AA would make a disabled row indistinguishable from an enabled one.
  it("keeps textDisabled below the enabled text contrast so disabled still reads as disabled", () => {
    for (const [, colors] of THEMES) {
      expect(contrast(colors.textDisabled, colors.background)).toBeLessThan(
        contrast(colors.textSecondary, colors.background)
      )
    }
  })

  it("holds the surfaces to a tonal step, never a step that carries meaning on its own", () => {
    for (const [, colors] of THEMES) {
      for (const surface of ["card", "cardElevated", "well"] as const) {
        const step = contrast(colors[surface], colors.background)
        expect(step).toBeGreaterThan(1)
        expect(step).toBeLessThan(1.5)
      }
    }
  })
})
