/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { computeTotalDistance, haversine } from "./geo"
import { BOUNDARY_ACTION_MERGE, BOUNDARY_ACTION_SPLIT } from "../types/global"
import type { Trip, LocationCoords, BoundaryAction, TripBoundaryOverride } from "../types/global"
import type { TranslationKey } from "../i18n/options"

export const TRIP_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]

export function getTripColor(index: number): string {
  return TRIP_COLORS[(index - 1) % TRIP_COLORS.length]
}

export const DEFAULT_GAP_SECONDS = 900 // 15 minutes
// Total distance is no use here - stationary fixes accumulate it without moving
const MIN_TRIP_EXTENT_METERS = 100 // bbox diagonal, matches DatabaseHelper.getDailyStats

/** Identifies a boundary by the timestamps of the two locations either side of it. */
function boundaryKey(beforeTs: number, afterTs: number): string {
  return `${beforeTs}:${afterTs}`
}

export function buildBoundaryOverrideMap(overrides: TripBoundaryOverride[]): Map<string, BoundaryAction> {
  return new Map(overrides.map((o) => [boundaryKey(o.before_timestamp, o.after_timestamp), o.action]))
}

/**
 * Whether a new trip starts between these two consecutive points. A manual override wins over
 * the gap threshold in both directions. This is the single definition of a trip boundary:
 * segmentTrips applies it, and the merge and split call sites use it to work out which
 * boundaries are worth writing at all.
 */
export function boundarySplits(
  beforeTs: number,
  afterTs: number,
  overrides?: Map<string, BoundaryAction>,
  gapThresholdSeconds: number = DEFAULT_GAP_SECONDS
): boolean {
  const override = overrides?.get(boundaryKey(beforeTs, afterTs))
  if (override !== undefined) return override === BOUNDARY_ACTION_SPLIT
  return afterTs - beforeTs >= gapThresholdSeconds
}

/**
 * Segments a chronologically-sorted array of locations into trips.
 * A new trip starts when the time gap between consecutive points exceeds gapThresholdSeconds,
 * unless the user has manually overridden that boundary.
 */
export function segmentTrips(
  locations: LocationCoords[],
  gapThresholdSeconds: number = DEFAULT_GAP_SECONDS,
  overrides?: Map<string, BoundaryAction>
): Trip[] {
  if (locations.length === 0) return []

  // Kept alongside the trip rather than on it: only the extent filter below cares.
  const segments: { trip: Trip; forced: boolean }[] = []
  let startIndex = 0
  let startForced = false
  let currentTripLocations: LocationCoords[] = [locations[0]]

  for (let i = 1; i < locations.length; i++) {
    const prevTs = locations[i - 1].timestamp ?? 0
    const currTs = locations[i].timestamp ?? 0
    const forcedSplit = overrides?.get(boundaryKey(prevTs, currTs)) === BOUNDARY_ACTION_SPLIT

    if (boundarySplits(prevTs, currTs, overrides, gapThresholdSeconds)) {
      segments.push({ trip: buildTrip(currentTripLocations, startIndex), forced: startForced || forcedSplit })
      startIndex = i
      startForced = forcedSplit
      currentTripLocations = [locations[i]]
    } else {
      currentTripLocations.push(locations[i])
    }
  }

  if (currentTripLocations.length > 0) {
    segments.push({ trip: buildTrip(currentTripLocations, startIndex), forced: startForced })
  }

  // Drops stray fixes during long stops as well as stationary runs. A manually split trip is exempt,
  // so an explicit edit never looks like it did nothing. The exemption stops at one point: a split
  // stays legal after the points around it are deleted, and a lone point is not a trip.
  const filtered = segments.filter(
    (s) => (s.forced && s.trip.locations.length >= 2) || trackExtent(s.trip.locations) >= MIN_TRIP_EXTENT_METERS
  )
  // Re-index after filtering
  return filtered.map((s, i) => ({ ...s.trip, index: i + 1 }))
}

export const SPLIT_BLOCKED_NOT_A_TRIP: TranslationKey = "split.notATrip"
export const SPLIT_BLOCKED_ALREADY_BOUNDARY: TranslationKey = "split.alreadyBoundary"
export const SPLIT_BLOCKED_TRIP_TOO_SHORT: TranslationKey = "split.tripTooShort"
export const SPLIT_BLOCKED_TOO_SHORT: TranslationKey = "split.tooShort"

/** First and last index of the run of points containing index, bounded by the trip boundaries. */
function runBounds(
  locations: LocationCoords[],
  index: number,
  overrides?: Map<string, BoundaryAction>,
  gapThresholdSeconds: number = DEFAULT_GAP_SECONDS
): [number, number] {
  const ts = (i: number) => locations[i].timestamp ?? 0
  const splits = (i: number) => boundarySplits(ts(i), ts(i + 1), overrides, gapThresholdSeconds)
  let start = index
  while (start > 0 && !splits(start - 1)) start--
  let end = index
  while (end < locations.length - 1 && !splits(end)) end++
  return [start, end]
}

/**
 * Why a split before locations[index] would not produce two usable trips, or null if it would.
 *
 * Both sides need two points: a one-point trip has no duration and no distance, and because a
 * forced split exempts the segments either side from the extent filter it would be displayed
 * rather than dropped. That rules out the first two and last two points of any trip, so a trip
 * needs at least four points before it can be split anywhere.
 *
 * Returns the reason rather than a boolean so the caller can say why nothing happened; the map
 * cannot show this state on the point itself.
 */
export function splitBlockedReason(
  locations: LocationCoords[],
  index: number,
  overrides?: Map<string, BoundaryAction>,
  gapThresholdSeconds: number = DEFAULT_GAP_SECONDS
): TranslationKey | null {
  if (index < 0 || index >= locations.length) return SPLIT_BLOCKED_ALREADY_BOUNDARY
  const ts = (i: number) => locations[i].timestamp ?? 0
  const splits = (i: number) => boundarySplits(ts(i), ts(i + 1), overrides, gapThresholdSeconds)

  // Checked first so a short trip gives the same answer wherever it is tapped, rather than
  // sending the user round points that all refuse for different-sounding reasons.
  const [start, end] = runBounds(locations, index, overrides, gapThresholdSeconds)
  if (end - start + 1 < 4) return SPLIT_BLOCKED_TRIP_TOO_SHORT

  // Forcing a split where one already happens would only exempt the neighbours from the extent
  // filter, resurrecting the stationary runs the segmenter drops on purpose.
  if (index === 0 || splits(index - 1)) return SPLIT_BLOCKED_ALREADY_BOUNDARY
  // A boundary on either shoulder would leave a one-point trip behind
  if (index < 2 || index > locations.length - 2) return SPLIT_BLOCKED_TOO_SHORT
  if (splits(index - 2) || splits(index)) return SPLIT_BLOCKED_TOO_SHORT
  return null
}

/**
 * The merges needed to fuse two displayed trips. Usually one, but trips dropped by the extent
 * filter still have their locations in the array, so merging across one spans several boundaries.
 *
 * Only boundaries that currently split are returned. The points inside a dropped stationary run
 * are seconds apart and would never split on their own, and writing a row for each of those would
 * put hundreds of no-op rows in the table for every merge over a long stop.
 */
export function gapsBetweenTrips(
  locations: LocationCoords[],
  earlier: Trip,
  later: Trip,
  overrides?: Map<string, BoundaryAction>,
  gapThresholdSeconds: number = DEFAULT_GAP_SECONDS
): TripBoundaryOverride[] {
  const gaps: TripBoundaryOverride[] = []
  const from = earlier.startIndex + earlier.locationCount - 1
  for (let i = from; i < later.startIndex && i + 1 < locations.length; i++) {
    const beforeTs = locations[i].timestamp ?? 0
    const afterTs = locations[i + 1].timestamp ?? 0
    if (!boundarySplits(beforeTs, afterTs, overrides, gapThresholdSeconds)) continue
    gaps.push({ before_timestamp: beforeTs, after_timestamp: afterTs, action: BOUNDARY_ACTION_MERGE })
  }
  return gaps
}

/** Bounding box diagonal, in meters. */
function trackExtent(locations: LocationCoords[]): number {
  if (locations.length === 0) return 0
  let minLat = locations[0].latitude
  let maxLat = locations[0].latitude
  let minLon = locations[0].longitude
  let maxLon = locations[0].longitude
  for (const loc of locations) {
    if (loc.latitude < minLat) minLat = loc.latitude
    if (loc.latitude > maxLat) maxLat = loc.latitude
    if (loc.longitude < minLon) minLon = loc.longitude
    if (loc.longitude > maxLon) maxLon = loc.longitude
  }
  return haversine(minLat, minLon, maxLat, maxLon)
}

function buildTrip(locations: LocationCoords[], startIndex: number): Trip {
  return {
    index: 0,
    locations,
    startTime: locations[0].timestamp ?? 0,
    endTime: locations[locations.length - 1].timestamp ?? 0,
    distance: computeTotalDistance(locations),
    locationCount: locations.length,
    startIndex
  }
}

export interface TripStats {
  avgSpeed: number // m/s
  elevationGain: number // meters
  elevationLoss: number // meters
}

// Reported altitude swings up and down between consecutive fixes, so adding the raw differences
// counts each swing as both a climb and a descent and badly overstates them. The window is in
// seconds rather than samples so the amount of smoothing does not change with the fix interval.
const ELEVATION_SMOOTHING_HALF_WINDOW_SECONDS = 12
// One pass leaves a ripple behind when the noise alternates on every fix.
const ELEVATION_SMOOTHING_PASSES = 2
// Smoothing cannot fully flatten the wobble, so ignore what is left rather than accumulate it
// over thousands of points.
const ELEVATION_THRESHOLD_METERS = 1

interface AltitudeRun {
  altitudes: number[]
  /** Null when any point lacks a timestamp, which leaves the run unsmoothed. */
  timestamps: number[] | null
}

/** Runs of consecutive altitudes, broken wherever a point reports none. */
function altitudeRuns(locations: LocationCoords[]): AltitudeRun[] {
  const runs: AltitudeRun[] = []
  let altitudes: number[] = []
  let timestamps: number[] = []
  let timed = true

  const flush = () => {
    if (altitudes.length > 0) runs.push({ altitudes, timestamps: timed ? timestamps : null })
    altitudes = []
    timestamps = []
    timed = true
  }

  for (const loc of locations) {
    if (loc.altitude == null) {
      flush()
      continue
    }
    altitudes.push(loc.altitude)
    if (loc.timestamp == null) timed = false
    else timestamps.push(loc.timestamp)
  }
  flush()
  return runs
}

/**
 * Centered moving average over a fixed time window. Points with no neighbour inside the window
 * keep their own value, so sparsely sampled tracks such as imports pass through untouched.
 */
function smoothAltitudes(altitudes: number[], timestamps: number[]): number[] {
  const half = ELEVATION_SMOOTHING_HALF_WINDOW_SECONDS
  let smoothed = altitudes

  for (let pass = 0; pass < ELEVATION_SMOOTHING_PASSES; pass++) {
    const source = smoothed
    smoothed = source.map((_, i) => {
      let sum = source[i]
      let count = 1
      for (let j = i - 1; j >= 0 && timestamps[i] - timestamps[j] <= half; j--) {
        sum += source[j]
        count++
      }
      for (let j = i + 1; j < source.length && timestamps[j] - timestamps[i] <= half; j++) {
        sum += source[j]
        count++
      }
      return sum / count
    })
  }
  return smoothed
}

export function computeTripStats(locations: LocationCoords[]): TripStats {
  let elevationGain = 0
  let elevationLoss = 0

  for (const run of altitudeRuns(locations)) {
    const series = run.timestamps ? smoothAltitudes(run.altitudes, run.timestamps) : run.altitudes
    // Measure from the last altitude committed rather than the previous point, so wobble under
    // the threshold is skipped instead of being carried into the next comparison.
    let reference = series[0]
    for (let i = 1; i < series.length; i++) {
      const diff = series[i] - reference
      if (diff > ELEVATION_THRESHOLD_METERS) {
        elevationGain += diff
        reference = series[i]
      } else if (diff < -ELEVATION_THRESHOLD_METERS) {
        elevationLoss += Math.abs(diff)
        reference = series[i]
      }
    }
  }

  // Elapsed time, so stopped time counts
  let avgSpeed = 0
  if (locations.length > 1) {
    const seconds = (locations[locations.length - 1].timestamp ?? 0) - (locations[0].timestamp ?? 0)
    if (seconds > 0) avgSpeed = computeTotalDistance(locations) / seconds
  }

  return {
    avgSpeed,
    elevationGain,
    elevationLoss
  }
}

const MIN_PROFILE_SAMPLES = 3

/** Bucket means along an axis. An empty bucket sits on the line between its filled neighbours. */
function bucketProfile(
  positions: number[],
  values: number[],
  start: number,
  span: number,
  maxBuckets: number
): number[] {
  const samples = values.length
  if (samples < MIN_PROFILE_SAMPLES) return []

  const buckets = Math.min(maxBuckets, samples)
  const sums = new Array<number>(buckets).fill(0)
  const counts = new Array<number>(buckets).fill(0)
  for (let i = 0; i < samples; i++) {
    const fraction = span > 0 ? (positions[i] - start) / span : i / (samples - 1)
    const bucket = Math.max(0, Math.min(buckets - 1, Math.round(fraction * (buckets - 1))))
    sums[bucket] += values[i]
    counts[bucket]++
  }

  const filled: number[] = []
  for (let i = 0; i < buckets; i++) if (counts[i] > 0) filled.push(i)
  const profile = new Array<number>(buckets)
  for (const i of filled) profile[i] = sums[i] / counts[i]
  profile.fill(profile[filled[0]], 0, filled[0])
  profile.fill(profile[filled[filled.length - 1]], filled[filled.length - 1] + 1)
  for (let k = 1; k < filled.length; k++) {
    const from = filled[k - 1]
    const to = filled[k]
    for (let i = from + 1; i < to; i++) {
      profile[i] = profile[from] + ((profile[to] - profile[from]) * (i - from)) / (to - from)
    }
  }
  return profile
}

export function buildSpeedProfile(locations: LocationCoords[], maxBuckets: number): number[] {
  if (locations.length === 0) return []
  const start = locations[0].timestamp ?? 0
  const span = (locations[locations.length - 1].timestamp ?? 0) - start
  const positions: number[] = []
  const values: number[] = []
  for (const loc of locations) {
    if (loc.speed == null) continue
    positions.push(loc.timestamp ?? start)
    values.push(loc.speed)
  }
  return bucketProfile(positions, values, start, span, maxBuckets)
}

export function buildElevationProfile(locations: LocationCoords[], maxBuckets: number): number[] {
  const positions: number[] = []
  const values: number[] = []
  let travelled = 0
  locations.forEach((loc, i) => {
    if (i > 0) {
      const prev = locations[i - 1]
      travelled += haversine(prev.latitude, prev.longitude, loc.latitude, loc.longitude)
    }
    if (loc.altitude == null) return
    positions.push(travelled)
    values.push(loc.altitude)
  })
  return bucketProfile(positions, values, 0, travelled, maxBuckets)
}
