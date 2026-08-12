import { formatCount } from "../format"

describe("formatCount", () => {
  it("keeps counts that fit a stat column exact to the digit", () => {
    expect(formatCount(0)).toBe("0")
    // Digits only: the grouping separator is the device locale's, not the assertion's.
    expect(formatCount(1234).replace(/\D/g, "")).toBe("1234")
    expect(formatCount(99_999).replace(/\D/g, "")).toBe("99999")
  })

  it("does not abbreviate below the column's width limit", () => {
    expect(formatCount(99_999)).not.toMatch(/[KM]$/)
  })

  it("abbreviates once the grouped digits would overflow the column", () => {
    expect(formatCount(100_000)).toBe("100K")
    expect(formatCount(123_456)).toBe("123K")
  })

  it("floors thousands so nothing below a million reads as 1000K", () => {
    expect(formatCount(999_999)).toBe("999K")
  })

  it("switches to millions so a full database stays a few glyphs wide", () => {
    expect(formatCount(1_000_000)).toBe("1.0M")
    expect(formatCount(2_000_000)).toBe("2.0M")
    expect(formatCount(12_345_678)).toBe("12.3M")
  })
})
