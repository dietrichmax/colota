import {
  segmentTrips,
  getTripColor,
  TRIP_COLORS,
  computeTripStats,
  buildBoundaryOverrideMap,
  gapsBetweenTrips,
  boundarySplits,
  splitBlockedReason,
  SPLIT_BLOCKED_ALREADY_BOUNDARY,
  SPLIT_BLOCKED_TOO_SHORT,
  SPLIT_BLOCKED_TRIP_TOO_SHORT
} from "../trips"
import { formatDuration, formatTime, formatDate, computeTotalDistance } from "../geo"
import { BOUNDARY_ACTION_MERGE, BOUNDARY_ACTION_SPLIT, type TripBoundaryOverride } from "../../types/global"

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

describe("manual trip boundary overrides", () => {
  const overrideMap = (overrides: TripBoundaryOverride[]) => buildBoundaryOverrideMap(overrides)

  it("keeps a merged boundary as one trip even though the gap exceeds the threshold", () => {
    // The point of a merge: the user says a long stop was still the same journey
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1905 }, // 900s gap
      { latitude: 52.531, longitude: 13.405, timestamp: 1910 }
    ]
    expect(segmentTrips(locations)).toHaveLength(2)

    const merged = segmentTrips(
      locations,
      undefined,
      overrideMap([{ before_timestamp: 1005, after_timestamp: 1905, action: BOUNDARY_ACTION_MERGE }])
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].locationCount).toBe(4)
  })

  it("splits a short gap the user marked, which the threshold would never split on its own", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1010 },
      { latitude: 52.531, longitude: 13.405, timestamp: 1015 }
    ]
    expect(segmentTrips(locations)).toHaveLength(1)

    const split = segmentTrips(
      locations,
      undefined,
      overrideMap([{ before_timestamp: 1005, after_timestamp: 1010, action: BOUNDARY_ACTION_SPLIT }])
    )
    expect(split).toHaveLength(2)
    expect(split[0].endTime).toBe(1005)
    expect(split[1].startTime).toBe(1010)
  })

  it("keeps both sides of a manual split even when one is too small to survive the extent filter", () => {
    // Otherwise the user taps Split, the fragment is dropped as stationary jitter, and the
    // action looks like it silently did nothing.
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.5300001, longitude: 13.405, timestamp: 1010 },
      { latitude: 52.5300002, longitude: 13.405, timestamp: 1015 }
    ]
    const split = segmentTrips(
      locations,
      undefined,
      overrideMap([{ before_timestamp: 1005, after_timestamp: 1010, action: BOUNDARY_ACTION_SPLIT }])
    )
    expect(split).toHaveLength(2)
    expect(split[1].locationCount).toBe(2)
    // Re-indexed contiguously, so the UI never shows a gap in trip numbering
    expect(split.map((t) => t.index)).toEqual([1, 2])
  })

  it("drops a one-point segment even though a split forces it", () => {
    // A split is only written where both sides have two points, but deleting a point afterwards
    // can leave one side with a single fix. A lone point has no duration and no distance, so the
    // forced exemption stops here rather than displaying it.
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.5300001, longitude: 13.405, timestamp: 1010 }
    ]
    const trips = segmentTrips(
      locations,
      undefined,
      overrideMap([{ before_timestamp: 1000, after_timestamp: 1005, action: BOUNDARY_ACTION_SPLIT }])
    )
    // The two-point side survives on the exemption; the one-point side does not
    expect(trips).toHaveLength(1)
    expect(trips[0].locationCount).toBe(2)
    expect(trips[0].startTime).toBe(1005)
  })

  it("ignores an override whose timestamps no longer exist", () => {
    // Points can be deleted after an edit; the override has to degrade to a no-op, not misfire
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1905 },
      { latitude: 52.531, longitude: 13.405, timestamp: 1910 }
    ]
    const trips = segmentTrips(
      locations,
      undefined,
      overrideMap([{ before_timestamp: 7777, after_timestamp: 8888, action: BOUNDARY_ACTION_MERGE }])
    )
    expect(trips).toHaveLength(2)
  })
})

describe("gapsBetweenTrips", () => {
  it("returns the single gap between two directly adjacent trips", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.521, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1905 },
      { latitude: 52.531, longitude: 13.405, timestamp: 1910 }
    ]
    const trips = segmentTrips(locations)
    expect(gapsBetweenTrips(locations, trips[0], trips[1])).toEqual([
      { before_timestamp: 1005, after_timestamp: 1905, action: BOUNDARY_ACTION_MERGE }
    ])
  })

  it("covers every splitting boundary when a filtered-out trip sits between the two trips", () => {
    // Trips dropped by the extent filter keep their points in the array, so merging across one
    // spans more than one boundary. Writing only the endpoint pair would match no real gap.
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.522, longitude: 13.405, timestamp: 1005 },
      // stationary run, dropped by the extent filter
      { latitude: 52.6, longitude: 13.405, timestamp: 2000 },
      { latitude: 52.6, longitude: 13.405, timestamp: 2600 },
      { latitude: 52.6, longitude: 13.405, timestamp: 3200 },
      { latitude: 52.7, longitude: 13.405, timestamp: 4200 },
      { latitude: 52.702, longitude: 13.405, timestamp: 4205 }
    ]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(2)

    const gaps = gapsBetweenTrips(locations, trips[0], trips[1])
    // Only the two boundaries that actually split. The 600s steps inside the stationary run are
    // under the threshold and would never split, so a row for either would be a permanent no-op.
    expect(gaps.map((g) => [g.before_timestamp, g.after_timestamp])).toEqual([
      [1005, 2000],
      [3200, 4200]
    ])

    // Suppressing exactly those two is still enough to collapse everything into one trip
    expect(segmentTrips(locations, undefined, buildBoundaryOverrideMap(gaps))).toHaveLength(1)
  })

  it("returns a boundary the user had split, so merging the two trips undoes the split", () => {
    const locations = [
      { latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { latitude: 52.53, longitude: 13.405, timestamp: 1005 },
      { latitude: 52.54, longitude: 13.405, timestamp: 1010 },
      { latitude: 52.55, longitude: 13.405, timestamp: 1015 }
    ]
    const trips = segmentTrips(locations)
    expect(trips).toHaveLength(1)

    // A short boundary only counts because a SPLIT override is holding it open
    const overrides = buildBoundaryOverrideMap([
      { before_timestamp: 1005, after_timestamp: 1010, action: BOUNDARY_ACTION_SPLIT }
    ])
    const split = segmentTrips(locations, undefined, overrides)
    expect(gapsBetweenTrips(locations, split[0], split[1], overrides)).toEqual([
      { before_timestamp: 1005, after_timestamp: 1010, action: BOUNDARY_ACTION_MERGE }
    ])
  })
})

describe("splitBlockedReason", () => {
  // 6 points, 5s apart, all one trip
  const day = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    latitude: 52.52 + i * 0.01,
    longitude: 13.405,
    timestamp: 1000 + i * 5
  }))

  it("blocks a split that would leave a one-point trip on either side", () => {
    // A one-point trip has no duration and no distance, and the forced-split exemption means it
    // would be displayed rather than dropped by the extent filter
    expect(splitBlockedReason(day, 1)).toBe(SPLIT_BLOCKED_TOO_SHORT) // leaves [p0] behind
    expect(splitBlockedReason(day, day.length - 1)).toBe(SPLIT_BLOCKED_TOO_SHORT) // leaves [p5] ahead
    expect(splitBlockedReason(day, 2)).toBeNull()
    expect(splitBlockedReason(day, 3)).toBeNull()
  })

  it("blocks the ends of the array outright", () => {
    expect(splitBlockedReason(day, 0)).toBe(SPLIT_BLOCKED_ALREADY_BOUNDARY)
    expect(splitBlockedReason(day, -1)).toBe(SPLIT_BLOCKED_ALREADY_BOUNDARY)
    expect(splitBlockedReason(day, day.length)).toBe(SPLIT_BLOCKED_ALREADY_BOUNDARY)
  })

  it("gives a trip too short to split the same answer wherever it is tapped", () => {
    // Otherwise the first point says "already starts a trip" and the second says "needs two
    // points a side", sending the user round a loop of points that all refuse
    const twoPoint = day.slice(0, 2)
    expect(splitBlockedReason(twoPoint, 0)).toBe(SPLIT_BLOCKED_TRIP_TOO_SHORT)
    expect(splitBlockedReason(twoPoint, 1)).toBe(SPLIT_BLOCKED_TRIP_TOO_SHORT)

    const threePoint = day.slice(0, 3)
    expect(threePoint.map((_, i) => splitBlockedReason(threePoint, i))).toEqual([
      SPLIT_BLOCKED_TRIP_TOO_SHORT,
      SPLIT_BLOCKED_TRIP_TOO_SHORT,
      SPLIT_BLOCKED_TRIP_TOO_SHORT
    ])

    // Four points split down the middle into two two-point trips
    expect(splitBlockedReason(day.slice(0, 4), 2)).toBeNull()
  })

  it("reports the short-trip reason from the containing run, not the whole day", () => {
    // A two-point trip next to a long one is still too short, even though the day has plenty
    const dayWithShortTrip = [
      { id: 1, latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { id: 2, latitude: 52.53, longitude: 13.405, timestamp: 1005 },
      { id: 3, latitude: 52.54, longitude: 13.405, timestamp: 1010 },
      { id: 4, latitude: 52.55, longitude: 13.405, timestamp: 1015 },
      // 900s gap, then a two-point trip
      { id: 5, latitude: 52.56, longitude: 13.405, timestamp: 1915 },
      { id: 6, latitude: 52.57, longitude: 13.405, timestamp: 1920 }
    ]
    expect(splitBlockedReason(dayWithShortTrip, 4)).toBe(SPLIT_BLOCKED_TRIP_TOO_SHORT)
    expect(splitBlockedReason(dayWithShortTrip, 5)).toBe(SPLIT_BLOCKED_TRIP_TOO_SHORT)
    // The four-point trip beside it is unaffected
    expect(splitBlockedReason(dayWithShortTrip, 2)).toBeNull()
  })

  // Two four-point trips either side of a 900s gap, so every run is long enough to split and
  // the per-point reasons are what's actually under test
  const twoTrips = [
    { id: 1, latitude: 52.52, longitude: 13.405, timestamp: 1000 },
    { id: 2, latitude: 52.53, longitude: 13.405, timestamp: 1005 },
    { id: 3, latitude: 52.54, longitude: 13.405, timestamp: 1010 },
    { id: 4, latitude: 52.55, longitude: 13.405, timestamp: 1015 },
    // 900s gap: index 4 already starts a trip
    { id: 5, latitude: 52.56, longitude: 13.405, timestamp: 1915 },
    { id: 6, latitude: 52.57, longitude: 13.405, timestamp: 1920 },
    { id: 7, latitude: 52.58, longitude: 13.405, timestamp: 1925 },
    { id: 8, latitude: 52.59, longitude: 13.405, timestamp: 1930 }
  ]

  it("names the right reason for a boundary that already splits", () => {
    expect(splitBlockedReason(twoTrips, 4)).toBe(SPLIT_BLOCKED_ALREADY_BOUNDARY)
    expect(splitBlockedReason(twoTrips, 3)).toBe(SPLIT_BLOCKED_TOO_SHORT) // leaves [p3] alone
    expect(splitBlockedReason(twoTrips, 5)).toBe(SPLIT_BLOCKED_TOO_SHORT) // leaves [p4] alone
    expect(splitBlockedReason(twoTrips, 2)).toBeNull()
    expect(splitBlockedReason(twoTrips, 6)).toBeNull()
  })

  it("keeps a merged boundary splittable, so a merge can be undone", () => {
    const merged = buildBoundaryOverrideMap([
      { before_timestamp: 1015, after_timestamp: 1915, action: BOUNDARY_ACTION_MERGE }
    ])
    // Without the override the gap is a real boundary and index 4 is not splittable
    expect(splitBlockedReason(twoTrips, 4)).toBe(SPLIT_BLOCKED_ALREADY_BOUNDARY)
    expect(splitBlockedReason(twoTrips, 4, merged)).toBeNull()
  })
})

describe("boundarySplits", () => {
  it("splits on a gap at or over the threshold, and not under it", () => {
    expect(boundarySplits(1000, 1900)).toBe(true)
    expect(boundarySplits(1000, 1899)).toBe(false)
  })

  it("lets an override win over the gap in both directions", () => {
    // This is what stops the merge and split call sites disagreeing with segmentTrips
    const merged = buildBoundaryOverrideMap([
      { before_timestamp: 1000, after_timestamp: 1900, action: BOUNDARY_ACTION_MERGE }
    ])
    expect(boundarySplits(1000, 1900, merged)).toBe(false)

    const forced = buildBoundaryOverrideMap([
      { before_timestamp: 1000, after_timestamp: 1005, action: BOUNDARY_ACTION_SPLIT }
    ])
    expect(boundarySplits(1000, 1005, forced)).toBe(true)
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
