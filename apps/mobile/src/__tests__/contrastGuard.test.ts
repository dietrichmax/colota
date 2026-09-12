import { lightColors, darkColors, type ThemeColors } from "@colota/shared"

/**
 * Contrast is the one colour rule a machine can settle, so it is settled here rather than in a
 * status page nobody runs.
 *
 * Ten pairs fail today and are pinned at their measured ratio in DEFERRED. A pin is a number, not
 * an exemption: a pair that gets worse fails, and a pair that gets fixed fails too, because its
 * pin is then stale and has to be deleted. Adding a pin is a deliberate line in a diff.
 *
 * What this cannot do: the pair list is written by hand, because knowing that textSecondary is
 * painted on card rather than background needs the layout. It proves things about the pairs
 * below and says nothing about a pairing introduced later. The other guards walk the source and
 * are complete over what they check; this one is not.
 *
 * textDisabled and placeholder are absent on purpose: WCAG exempts disabled controls and
 * placeholder text is not the field's accessible name.
 */

/** WCAG 2.2: 4.5 for text under 18pt, 3.0 for a UI component or meaningful graphic. */
const TEXT = 4.5
const UI = 3.0

type Pair = [fg: keyof ThemeColors, bg: keyof ThemeColors, floor: number]

const PAIRS: Pair[] = [
  ["text", "background", TEXT],
  ["text", "card", TEXT],
  ["text", "well", TEXT],
  ["textSecondary", "background", TEXT],
  ["textSecondary", "card", TEXT],
  ["textSecondary", "well", TEXT],
  ["textLight", "background", TEXT],
  ["textLight", "card", TEXT],
  ["link", "card", TEXT],
  ["text", "surfaceRaised", TEXT],
  ["textSecondary", "surfaceRaised", TEXT],
  ["primary", "surfaceRaised", TEXT],
  ["link", "surfaceRaised", TEXT],
  ["textLight", "surfaceRaised", UI],
  ["success", "surfaceRaised", UI],
  ["warning", "surfaceRaised", UI],
  ["error", "surfaceRaised", UI],
  ["textOnPrimary", "primary", TEXT],
  ["textOnPrimary", "error", TEXT],
  ["onPrimaryContainer", "primaryContainer", TEXT],
  ["primary", "background", TEXT],
  ["primary", "card", TEXT],
  ["primaryDark", "background", TEXT],
  ["primaryDark", "card", TEXT],
  ["error", "background", TEXT],
  ["error", "card", TEXT],
  ["warning", "background", TEXT],
  ["warning", "card", TEXT],
  ["info", "background", TEXT],
  ["info", "card", TEXT],
  ["border", "background", UI],
  ["border", "card", UI],
  ["border", "well", UI],
  ["success", "background", UI],
  ["success", "card", UI],
  ["primary", "well", UI]
]

/** Empty on purpose: every pair clears its floor. A pin here is a palette decision not yet taken. */
const DEFERRED: Record<string, Record<string, number>> = {
  light: {},
  dark: {}
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

const THEMES: [name: string, colors: ThemeColors][] = [
  ["light", lightColors],
  ["dark", darkColors]
]

describe("contrast", () => {
  it("computes the ratio WCAG defines, so every number below means something", () => {
    // The published boundary case: #767676 is the darkest grey that clears 4.5 on white.
    expect(ratio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 1)
    expect(ratio("#000000", "#FFFFFF")).toBe(21)
    expect(ratio("#FFFFFF", "#FFFFFF")).toBe(1)
  })

  for (const [themeName, colors] of THEMES) {
    describe(themeName, () => {
      const deferred = DEFERRED[themeName]

      it("clears the floor on every pair that is not deferred", () => {
        const failures: string[] = []
        for (const [fg, bg, floor] of PAIRS) {
          const key = `${fg} on ${bg}`
          if (key in deferred) continue
          const measured = ratio(colors[fg] as string, colors[bg] as string)
          if (measured < floor) failures.push(`${key} is ${measured}, floor ${floor}`)
        }

        expect(failures).toEqual([])
      })

      it("lets no deferred pair get worse than the day it was measured", () => {
        const regressions: string[] = []
        for (const [key, pinned] of Object.entries(deferred)) {
          const [fg, bg] = key.split(" on ") as [keyof ThemeColors, keyof ThemeColors]
          const measured = ratio(colors[fg] as string, colors[bg] as string)
          if (measured < pinned) regressions.push(`${key} fell from ${pinned} to ${measured}`)
        }

        expect(regressions).toEqual([])
      })

      it("keeps no pin for a pair that now passes, so the list can only shrink", () => {
        const stale: string[] = []
        for (const [key, pinned] of Object.entries(deferred)) {
          const [fg, bg] = key.split(" on ") as [keyof ThemeColors, keyof ThemeColors]
          const floor = PAIRS.find(([f, b]) => f === fg && b === bg)?.[2] ?? TEXT
          const measured = ratio(colors[fg] as string, colors[bg] as string)
          if (measured >= floor) stale.push(`${key} is ${measured} and clears ${floor}: delete its pin (was ${pinned})`)
        }

        expect(stale).toEqual([])
      })

      it("defers nothing that is not in the pair list, so a pin cannot hide an unchecked pairing", () => {
        const orphans = Object.keys(deferred).filter((key) => !PAIRS.some(([fg, bg]) => `${fg} on ${bg}` === key))

        expect(orphans).toEqual([])
      })
    })
  }
})
