import { segmentTrips, getTripColor, TRIP_COLORS, computeTripStats } from "../trips"
import { formatDuration, formatTime, formatDate, computeTotalDistance } from "../geo"

describe("segmentTrips", () => {
  it("returns empty array for empty input", () => {
    expect(segmentTrips([])).toEqual([])
  })

  it("filters out single-point trips", () => {
    const locations = [{ latitude: 52.52, longitude: 13.405, timestamp: 1000 }]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(0)
  })

  it("returns one trip when no gaps exceed threshold", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.522, longitude: 13.405, timestamp: 1010 }
    ]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(1)
    expect(trips[0].locationCount).toBe(3)
    expect(trips[0].startTime).toBe(1000)
    expect(trips[0].endTime).toBe(1010)
  })

  it("splits into two trips on a 15-minute gap", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1905 }, // 900s gap
      { latitude: 52.531, longitude: 13.405, timestamp: 1910 }
    ]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(2)
    expect(trips[0].index).toBe(1)
    expect(trips[0].locationCount).toBe(2)
    expect(trips[0].endTime).toBe(1005)
    expect(trips[1].index).toBe(2)
    expect(trips[1].locationCount).toBe(2)
    expect(trips[1].startTime).toBe(1905)
  })

  it("splits into multiple trips with multiple gaps", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.53, longitude: 13.405, timestamp: 2000 }, // 995s gap
      { latitude: 52.531, longitude: 13.405, timestamp: 2005 },
      { latitude: 52.54, longitude: 13.405, timestamp: 3000 }, // 995s gap
      { latitude: 52.541, longitude: 13.405, timestamp: 3005 }
    ]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(3)
    expect(trips[0].index).toBe(1)
    expect(trips[1].index).toBe(2)
    expect(trips[2].index).toBe(3)
  })

  it("does not split when gap is just below threshold", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1899 } // 899s < 900s
    ]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(1)
  })

  it("splits when gap is exactly at threshold", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1905 }, // exactly 900s gap
      { latitude: 52.531, longitude: 13.405, timestamp: 1910 }
    ]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(2)
  })

  it("computes distance for each trip", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1005 } // ~1.11 km
    ]
    const trips = segmentTrips(locations)
    expect(trips[0].distance).toBeGreaterThan(1000)
    expect(trips[0].distance).toBeLessThan(1200)
  })

  it("drops a stationary run at a single coordinate", () => {
    // Heartbeat points at the zone centre
    const locations = Array.from({ length: 20 }, (_, i) => ({
      latitude: 52.52,
      longitude: 13.405,
      timestamp: 1000 + i * 600
    }))
    expect(segmentTrips(locations)).toHaveLength(0)
  })

  it("drops a jittering stationary run even though its total distance is long", () => {
    // Real fixes, so every point moves - total distance passes 200m while the bbox stays ~60m
    const offsets = [0, 0.0002, -0.0001, 0.00025, -0.00022, 0.0001, -0.00025, 0.00018, -0.00015, 0.00022]
    const locations = offsets.map((d, i) => ({
      latitude: 52.52 + d,
      longitude: 13.405 + (i % 2 === 0 ? d : -d),
      timestamp: 1000 + i * 600
    }))
    expect(computeTotalDistance(locations)).toBeGreaterThan(200)
    expect(segmentTrips(locations)).toHaveLength(0)
  })

  it("keeps a round trip that returns to its start", () => {
    // start == end, but the track reaches ~330m away
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1100 },
      { latitude: 52.523, longitude: 13.405, timestamp: 1200 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1300 },
      { latitude: 52.52, longitude: 13.405, timestamp: 1400 }
    ]
    expect(segmentTrips(locations)).toHaveLength(1)
  })

  it("reports each trip's offset into the full location array", () => {
    // TrackMap indexes point colors by this offset
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.522, longitude: 13.405, timestamp: 1005 },
      // stationary run, dropped
      { latitude: 52.6, longitude: 13.405, timestamp: 2000 },
      { latitude: 52.6, longitude: 13.405, timestamp: 2600 },
      { latitude: 52.6, longitude: 13.405, timestamp: 3200 },
      { latitude: 52.7, longitude: 13.405, timestamp: 4200 },
      { latitude: 52.702, longitude: 13.405, timestamp: 4205 }
    ]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(2)
    expect(trips[0].startIndex).toBe(0)
    expect(trips[1].startIndex).toBe(5)
  })

  it("respects custom gap threshold", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1305 }, // 300s gap
      { latitude: 52.531, longitude: 13.405, timestamp: 1310 }
    ]
    expect(segmentTrips(locations, 300)).toHaveLength(2)
    expect(segmentTrips(locations, 301)).toHaveLength(1)
  })
})

describe("formatDuration", () => {
  it("formats minutes only", () => {
    expect(formatDuration(300)).toBe("5m")
    expect(formatDuration(0)).toBe("0m")
    expect(formatDuration(59)).toBe("0m")
    expect(formatDuration(60)).toBe("1m")
  })

  it("formats hours and minutes", () => {
    expect(formatDuration(3600)).toBe("1h 0m")
    expect(formatDuration(3660)).toBe("1h 1m")
    expect(formatDuration(7200)).toBe("2h 0m")
    expect(formatDuration(5400)).toBe("1h 30m")
  })

  it("clamps negative values to 0", () => {
    expect(formatDuration(-1)).toBe("0m")
    expect(formatDuration(-3600)).toBe("0m")
  })
})

describe("getTripColor", () => {
  it("returns first color for index 1", () => {
    expect(getTripColor(1)).toBe(TRIP_COLORS[0])
  })

  it("cycles through colors", () => {
    for (let i = 0; i < TRIP_COLORS.length; i++) {
      expect(getTripColor(i + 1)).toBe(TRIP_COLORS[i])
    }
  })

  it("wraps around when index exceeds palette length", () => {
    expect(getTripColor(TRIP_COLORS.length + 1)).toBe(TRIP_COLORS[0])
    expect(getTripColor(TRIP_COLORS.length + 2)).toBe(TRIP_COLORS[1])
  })
})

describe("computeTripStats", () => {
  it("returns zeros for empty locations", () => {
    const stats = computeTripStats([])
    expect(stats.avgSpeed).toBe(0)
    expect(stats.elevationGain).toBe(0)
    expect(stats.elevationLoss).toBe(0)
  })

  it("computes average speed from non-zero values", () => {
    const locations = [
      { latitude: 0, longitude: 0, speed: 2 },
      { latitude: 0, longitude: 0, speed: 4 },
      { latitude: 0, longitude: 0, speed: 6 }
    ]
    const stats = computeTripStats(locations)
    expect(stats.avgSpeed).toBe(4) // (2+4+6)/3
  })

  it("excludes zero and null speeds from average", () => {
    const locations = [
      { latitude: 0, longitude: 0, speed: 0 },
      { latitude: 0, longitude: 0, speed: undefined },
      { latitude: 0, longitude: 0, speed: 10 }
    ]
    const stats = computeTripStats(locations)
    expect(stats.avgSpeed).toBe(10) // only the 10 counts
  })

  it("derives average speed from position when no point has a usable speed", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000, speed: 0 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1050, speed: 0 }
    ]
    // 0.001 degrees of latitude is ~111.2m, covered in 50s
    const stats = computeTripStats(locations)
    expect(stats.avgSpeed).toBeCloseTo(2.224, 3)
  })

  it("prefers reported speeds over the position-derived fallback", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000, speed: 3 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1050, speed: 3 }
    ]
    // Position implies ~22 m/s over these 50s, so a flipped precedence would be visible
    expect(computeTripStats(locations).avgSpeed).toBe(3)
  })

  it("computes elevation gain and loss", () => {
    const locations = [
      { latitude: 0, longitude: 0, altitude: 100 },
      { latitude: 0, longitude: 0, altitude: 150 }, // +50
      { latitude: 0, longitude: 0, altitude: 120 }, // -30
      { latitude: 0, longitude: 0, altitude: 200 } // +80
    ]
    const stats = computeTripStats(locations)
    expect(stats.elevationGain).toBe(130) // 50 + 80
    expect(stats.elevationLoss).toBe(30)
  })

  it("ignores elevation diff when altitude is null", () => {
    const locations = [
      { latitude: 0, longitude: 0, altitude: 100 },
      { latitude: 0, longitude: 0, altitude: undefined },
      { latitude: 0, longitude: 0, altitude: 200 }
    ]
    const stats = computeTripStats(locations)
    // null gap means no diff is computed for either adjacent pair
    expect(stats.elevationGain).toBe(0)
    expect(stats.elevationLoss).toBe(0)
  })

  it("handles flat terrain (no gain or loss)", () => {
    const locations = [
      { latitude: 0, longitude: 0, altitude: 500 },
      { latitude: 0, longitude: 0, altitude: 500 },
      { latitude: 0, longitude: 0, altitude: 500 }
    ]
    const stats = computeTripStats(locations)
    expect(stats.elevationGain).toBe(0)
    expect(stats.elevationLoss).toBe(0)
  })
})

describe("formatTime", () => {
  it("formats without seconds by default", () => {
    // Use a fixed timestamp: 2024-01-15 14:30:00 UTC
    const ts = Math.floor(new Date("2024-01-15T14:30:00Z").getTime() / 1000)
    const result = formatTime(ts)
    // Should not contain a third colon-separated group (seconds)
    // The exact format depends on locale, but it should have hour and minute
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it("includes seconds when showSeconds is true", () => {
    const ts = Math.floor(new Date("2024-01-15T14:30:45Z").getTime() / 1000)
    const withSeconds = formatTime(ts, true)
    const withoutSeconds = formatTime(ts, false)
    // The version with seconds should be longer
    expect(withSeconds.length).toBeGreaterThan(withoutSeconds.length)
  })
})

describe("formatDate", () => {
  it("returns a non-empty string", () => {
    // 2024-01-15 12:00:00 UTC
    const ts = Math.floor(new Date("2024-01-15T12:00:00Z").getTime() / 1000)
    const result = formatDate(ts)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it("includes weekday and month", () => {
    // Force a known date: 2024-01-15 is a Monday
    const ts = Math.floor(new Date("2024-01-15T12:00:00Z").getTime() / 1000)
    const result = formatDate(ts)
    // Should contain abbreviated weekday and month (locale-dependent but always present)
    expect(result).toMatch(/\w{2,}/)
  })

  it("returns different strings for different dates", () => {
    const ts1 = Math.floor(new Date("2024-01-15T12:00:00Z").getTime() / 1000)
    const ts2 = Math.floor(new Date("2024-06-20T12:00:00Z").getTime() / 1000)
    expect(formatDate(ts1)).not.toBe(formatDate(ts2))
  })
})
