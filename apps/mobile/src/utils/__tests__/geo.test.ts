import { computeTotalDistance, formatDistance, formatSpeed } from "../geo"

describe("computeTotalDistance", () => {
  it("returns 0 for empty array", () => {
    expect(computeTotalDistance([])).toBe(0)
  })

  it("returns 0 for a single point", () => {
    expect(computeTotalDistance([{ latitude: 48.8566, longitude: 2.3522 }])).toBe(0)
  })

  it("calculates distance between two known points", () => {
    // Berlin (52.52, 13.405) → Munich (48.1351, 11.582) ≈ 504 km
    const locations = [
      { latitude: 52.52, longitude: 13.405 },
      { latitude: 48.1351, longitude: 11.582 }
    ]
    const meters = computeTotalDistance(locations)
    expect(meters).toBeGreaterThan(500_000)
    expect(meters).toBeLessThan(510_000)
  })

  it("sums distances across multiple consecutive points", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405 },
      { latitude: 52.53, longitude: 13.405 },
      { latitude: 52.54, longitude: 13.405 }
    ]
    // Two hops of ~1.11 km each ≈ 2.22 km total
    const meters = computeTotalDistance(locations)
    expect(meters).toBeGreaterThan(2000)
    expect(meters).toBeLessThan(2500)
  })

  it("returns 0 for identical points", () => {
    const locations = [
      { latitude: 48.8566, longitude: 2.3522 },
      { latitude: 48.8566, longitude: 2.3522 }
    ]
    expect(computeTotalDistance(locations)).toBe(0)
  })
})

describe("formatDistance", () => {
  let originalNumberFormat: typeof Intl.NumberFormat

  beforeEach(() => {
    originalNumberFormat = Intl.NumberFormat
  })

  afterEach(() => {
    // @ts-ignore – restore original
    Intl.NumberFormat = originalNumberFormat
  })

  it("formats as km for non-US locales", () => {
    // @ts-ignore – mock Intl
    Intl.NumberFormat = jest.fn(() => ({
      resolvedOptions: () => ({ locale: "de-DE" })
    }))
    expect(formatDistance(12345)).toBe("12.3 km")
  })

  it("formats as miles for en-US locale", () => {
    // @ts-ignore – mock Intl
    Intl.NumberFormat = jest.fn(() => ({
      resolvedOptions: () => ({ locale: "en-US" })
    }))
    expect(formatDistance(1609.344)).toBe("1.0 mi")
  })

  it("formats as miles for en-GB locale", () => {
    // @ts-ignore – mock Intl
    Intl.NumberFormat = jest.fn(() => ({
      resolvedOptions: () => ({ locale: "en-GB" })
    }))
    expect(formatDistance(8046.72)).toBe("5.0 mi")
  })

  it("formats 0 meters correctly", () => {
    // @ts-ignore – mock Intl
    Intl.NumberFormat = jest.fn(() => ({
      resolvedOptions: () => ({ locale: "de-DE" })
    }))
    expect(formatDistance(0)).toBe("0.0 km")
  })

  it("falls back to km if Intl throws", () => {
    // @ts-ignore – mock Intl to throw
    Intl.NumberFormat = jest.fn(() => {
      throw new Error("unsupported")
    })
    expect(formatDistance(5000)).toBe("5.0 km")
  })
})

describe("formatSpeed", () => {
  let originalNumberFormat: typeof Intl.NumberFormat

  beforeEach(() => {
    originalNumberFormat = Intl.NumberFormat
  })

  afterEach(() => {
    // @ts-ignore – restore original
    Intl.NumberFormat = originalNumberFormat
  })

  it("formats as km/h for non-US locales", () => {
    // @ts-ignore – mock Intl
    Intl.NumberFormat = jest.fn(() => ({
      resolvedOptions: () => ({ locale: "de-DE" })
    }))
    // 2 m/s = 7.2 km/h
    expect(formatSpeed(2)).toBe("7.2 km/h")
  })

  it("formats as mph for en-US locale", () => {
    // @ts-ignore – mock Intl
    Intl.NumberFormat = jest.fn(() => ({
      resolvedOptions: () => ({ locale: "en-US" })
    }))
    // 2 m/s ≈ 4.5 mph
    expect(formatSpeed(2)).toBe("4.5 mph")
  })

  it("formats 0 m/s correctly", () => {
    // @ts-ignore – mock Intl
    Intl.NumberFormat = jest.fn(() => ({
      resolvedOptions: () => ({ locale: "de-DE" })
    }))
    expect(formatSpeed(0)).toBe("0.0 km/h")
  })

  it("falls back to km/h if Intl throws", () => {
    // @ts-ignore – mock Intl to throw
    Intl.NumberFormat = jest.fn(() => {
      throw new Error("unsupported")
    })
    expect(formatSpeed(8)).toBe("28.8 km/h")
  })
})
