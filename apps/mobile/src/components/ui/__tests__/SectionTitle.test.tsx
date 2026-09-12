import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors, darkColors } from "@colota/shared"
import { SectionTitle } from "../SectionTitle"

let mockColors = lightColors

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: mockColors })
}))

/** WCAG AA for text under 18pt, which a 16px semiBold heading is. */
const AA = 4.5

function ratio(fg: string, bg: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

describe("SectionTitle", () => {
  afterEach(() => {
    mockColors = lightColors
  })

  it("reads its colour from the theme, so a heading is legible in both", () => {
    const { getByText, rerender } = render(<SectionTitle>Tracking</SectionTitle>)
    expect(getByText("Tracking").props.style).toEqual(expect.arrayContaining([{ color: lightColors.textSecondary }]))

    mockColors = darkColors
    rerender(<SectionTitle>Tracking</SectionTitle>)

    expect(getByText("Tracking").props.style).toEqual(expect.arrayContaining([{ color: darkColors.textSecondary }]))
  })

  it("announces itself as a heading, so a screen reader can jump between sections", () => {
    const { getByText } = render(<SectionTitle>Tracking</SectionTitle>)

    expect(getByText("Tracking").props.accessibilityRole).toBe("header")
  })

  it("keeps the arithmetic true: the heading clears AA on both surfaces", () => {
    for (const theme of [lightColors, darkColors]) {
      expect(ratio(theme.textSecondary, theme.background)).toBeGreaterThanOrEqual(AA)
      expect(ratio(theme.textSecondary, theme.card)).toBeGreaterThanOrEqual(AA)
    }
  })
})
