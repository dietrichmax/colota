import {
  computeTotalDistance,
  formatDistance,
  formatShortDistance,
  formatSpeed,
  formatTime,
  shortDistanceUnit,
  inputToMeters,
  metersToInput,
  getSpeedUnit,
  loadDisplayPreferences,
  getUnitSystem,
  getTimeFormat
} from "../geo"

const mockGetSetting = jest.fn()

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getSetting: (...args) => mockGetSetting(...args)
  }
}))

/** Helper to set cached preferences via loadDisplayPreferences */
async function setPreferences(unit, time) {
  mockGetSetting.mockImplementation((key) => {
    if (key === "unitSystem") return Promise.resolve(unit)
    if (key === "timeFormat") return Promise.resolve(time)
    return Promise.resolve("")
  })
  await loadDisplayPreferences()
}

/** Helper to mock locale */
function mockLocale(locale) {
  // @ts-ignore - mock Intl
  Intl.NumberFormat = jest.fn(() => ({
    resolvedOptions: () => ({ locale })
  }))
}

describe("computeTotalDistance", () => {
  it("returns 0 for empty array", () => {
    expect(computeTotalDistance([])).toBe(0)
  })

  it("returns 0 for a single point", () => {
    expect(computeTotalDistance([{ latitude: 48.8566, longitude: 2.3522 }])).toBe(0)
  })

  it("calculates distance between two known points", () => {
    // Berlin (52.52, 13.405) -> Munich (48.1351, 11.582) ~ 504 km
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
  let originalNumberFormat

  beforeEach(() => {
    originalNumberFormat = Intl.NumberFormat
  })

  afterEach(async () => {
    // @ts-ignore - restore original
    Intl.NumberFormat = originalNumberFormat
    await setPreferences("", "")
  })

  it("formats as km for metric", async () => {
    await setPreferences("metric", "")
    expect(formatDistance(12345)).toBe("12.3 km")
  })

  it("formats as miles for imperial", async () => {
    await setPreferences("imperial", "")
    expect(formatDistance(1609.344)).toBe("1.0 mi")
  })

  it("falls back to locale when no preference saved", async () => {
    await setPreferences("", "")
    mockLocale("en-US")
    expect(formatDistance(1609.344)).toBe("1.0 mi")
  })

  it("formats 0 meters correctly", async () => {
    await setPreferences("metric", "")
    expect(formatDistance(0)).toBe("0.0 km")
  })

  it("falls back to km if Intl throws and no preference", async () => {
    await setPreferences("", "")
    // @ts-ignore - mock Intl to throw
    Intl.NumberFormat = jest.fn(() => {
      throw new Error("unsupported")
    })
    expect(formatDistance(5000)).toBe("5.0 km")
  })
})

describe("formatShortDistance", () => {
  afterEach(async () => {
    await setPreferences("", "")
  })

  it("formats as meters for metric", async () => {
    await setPreferences("metric", "")
    expect(formatShortDistance(50)).toBe("50m")
  })

  it("formats as feet for imperial", async () => {
    await setPreferences("imperial", "")
    expect(formatShortDistance(50)).toBe("164 ft")
  })

  it("rounds to nearest foot", async () => {
    await setPreferences("imperial", "")
    expect(formatShortDistance(1)).toBe("3 ft")
  })
})

describe("formatSpeed", () => {
  afterEach(async () => {
    await setPreferences("", "")
  })

  it("formats as km/h for metric", async () => {
    await setPreferences("metric", "")
    expect(formatSpeed(2)).toBe("7.2 km/h")
  })

  it("formats as mph for imperial", async () => {
    await setPreferences("imperial", "")
    expect(formatSpeed(2)).toBe("4.5 mph")
  })

  it("formats 0 m/s correctly", async () => {
    await setPreferences("metric", "")
    expect(formatSpeed(0)).toBe("0.0 km/h")
  })
})

describe("getSpeedUnit", () => {
  afterEach(async () => {
    await setPreferences("", "")
  })

  it("returns km/h for metric", async () => {
    await setPreferences("metric", "")
    expect(getSpeedUnit()).toEqual({ factor: 3.6, unit: "km/h" })
  })

  it("returns mph for imperial", async () => {
    await setPreferences("imperial", "")
    expect(getSpeedUnit()).toEqual({ factor: 2.23694, unit: "mph" })
  })
})

describe("shortDistanceUnit", () => {
  afterEach(async () => {
    await setPreferences("", "")
  })

  it("returns m for metric", async () => {
    await setPreferences("metric", "")
    expect(shortDistanceUnit()).toBe("m")
  })

  it("returns ft for imperial", async () => {
    await setPreferences("imperial", "")
    expect(shortDistanceUnit()).toBe("ft")
  })
})

describe("inputToMeters", () => {
  afterEach(async () => {
    await setPreferences("", "")
  })

  it("returns value unchanged for metric", async () => {
    await setPreferences("metric", "")
    expect(inputToMeters(50)).toBe(50)
  })

  it("converts feet to meters for imperial", async () => {
    await setPreferences("imperial", "")
    const result = inputToMeters(164)
    expect(result).toBeCloseTo(49.987, 1)
  })
})

describe("metersToInput", () => {
  afterEach(async () => {
    await setPreferences("", "")
  })

  it("returns value unchanged for metric", async () => {
    await setPreferences("metric", "")
    expect(metersToInput(50)).toBe(50)
  })

  it("converts meters to feet for imperial", async () => {
    await setPreferences("imperial", "")
    expect(metersToInput(50)).toBe(164)
  })

  it("round-trips without significant drift", async () => {
    await setPreferences("imperial", "")
    const feet = metersToInput(50)
    const backToMeters = inputToMeters(feet)
    expect(backToMeters).toBeCloseTo(50, 0)
  })
})

describe("loadDisplayPreferences", () => {
  afterEach(async () => {
    await setPreferences("", "")
  })

  it("loads metric/24h", async () => {
    await setPreferences("metric", "24h")
    expect(getUnitSystem()).toBe("metric")
    expect(getTimeFormat()).toBe("24h")
  })

  it("loads imperial/12h", async () => {
    await setPreferences("imperial", "12h")
    expect(getUnitSystem()).toBe("imperial")
    expect(getTimeFormat()).toBe("12h")
  })

  it("falls back to locale for invalid values", async () => {
    await setPreferences("invalid", "invalid")
    const unit = getUnitSystem()
    expect(unit === "metric" || unit === "imperial").toBe(true)
  })

  it("handles native storage error gracefully", async () => {
    mockGetSetting.mockRejectedValue(new Error("storage error"))
    await loadDisplayPreferences()
    const unit = getUnitSystem()
    expect(unit === "metric" || unit === "imperial").toBe(true)
  })
})

describe("formatTime", () => {
  afterEach(async () => {
    await setPreferences("", "")
  })

  it("respects 24h format preference", async () => {
    await setPreferences("", "24h")
    const result = formatTime(1700000000)
    expect(result).not.toMatch(/am|pm/i)
  })

  it("respects 12h format preference", async () => {
    await setPreferences("", "12h")
    const result = formatTime(1700000000)
    expect(result).toMatch(/am|pm/i)
  })
})
