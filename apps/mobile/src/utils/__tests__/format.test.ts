import { formatBytes, formatCount, formatDecimal, formatExportDateTime } from "../format"

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

describe("formatBytes", () => {
  it("steps up through KB, MB and GB at 1024", () => {
    expect(formatBytes(0, { locale: "en-US" })).toBe("0 B")
    expect(formatBytes(512, { locale: "en-US" })).toBe("512 B")
    expect(formatBytes(1023, { locale: "en-US" })).toBe("1023 B")
    expect(formatBytes(1024, { locale: "en-US" })).toBe("1.0 KB")
    expect(formatBytes(1536, { locale: "en-US" })).toBe("1.5 KB")
    expect(formatBytes(1024 * 1024 - 1, { locale: "en-US" })).toMatch(/KB$/)
    expect(formatBytes(1024 * 1024, { locale: "en-US" })).toBe("1.0 MB")
    expect(formatBytes(3.42 * 1024 * 1024, { locale: "en-US" })).toBe("3.4 MB")
    expect(formatBytes(1.2 * 1024 ** 3, { locale: "en-US" })).toBe("1.2 GB")
  })

  it("uses the locale's decimal separator, so a size never reads as a grouped count", () => {
    expect(formatBytes(195.3 * 1024 * 1024, { locale: "de-DE" })).toBe("195,3 MB")
    expect(formatBytes(1536, { locale: "de-DE" })).toBe("1,5 KB")
  })

  it("drops the decimal when asked, as the database size does", () => {
    expect(formatBytes(195.3 * 1024 * 1024, { decimals: 0, locale: "de-DE" })).toBe("195 MB")
    expect(formatBytes(1.2 * 1024 ** 3, { decimals: 0, locale: "en-US" })).toBe("1 GB")
  })

  it("never groups digits, so 1000 MB cannot read as one megabyte", () => {
    expect(formatBytes(1000.4 * 1024 * 1024, { decimals: 0, locale: "de-DE" })).toBe("1000 MB")
  })

  // Callers convert megabytes, which can leave a fraction of a byte.
  it("rounds a fraction of a byte instead of printing it", () => {
    expect(formatBytes(524.288, { locale: "en-US" })).toBe("524 B")
  })
})

describe("formatDecimal", () => {
  // Distances, speeds and sizes share it, so every number in the app takes the device's separator.
  it("uses the locale's decimal separator and never groups thousands", () => {
    expect(formatDecimal(1234.56, 1, "en-US")).toBe("1234.6")
    expect(formatDecimal(1234.56, 1, "de-DE")).toBe("1234,6")
  })
})

describe("formatExportDateTime", () => {
  it("says Never for an export that has not run, rather than printing 1970", () => {
    expect(formatExportDateTime(0)).toBe("Never")
  })
})
