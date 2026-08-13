/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { computeTotalDistance, haversine } from "./geo"
import { BOUNDARY_ACTION_MERGE, BOUNDARY_ACTION_SPLIT } from "../types/global"
import type { Trip, LocationCoords, BoundaryAction, TripBoundaryOverride } from "../types/global"

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

export const SPLIT_BLOCKED_NOT_A_TRIP =
  "This point is not part of a trip. Colota leaves out runs that never travel more than 100 m."
export const SPLIT_BLOCKED_ALREADY_BOUNDARY = "This point already starts a trip."
export const SPLIT_BLOCKED_TRIP_TOO_SHORT =
  "This trip is too short to split. Splitting makes two trips, and each one needs at least two points."
export const SPLIT_BLOCKED_TOO_SHORT =
  "A split needs at least two points on each side, so the first two and last two points of a trip cannot start a new one."

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
): string | null {
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

export function computeTripStats(locations: LocationCoords[]): TripStats {
  let speedSum = 0
  let speedCount = 0
  let elevationGain = 0
  let elevationLoss = 0

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i]
    if (loc.speed != null && loc.speed > 0) {
      speedSum += loc.speed
      speedCount++
    }
    if (i > 0) {
      const prevAlt = locations[i - 1].altitude
      const currAlt = loc.altitude
      if (prevAlt != null && currAlt != null) {
        const diff = currAlt - prevAlt
        if (diff > 0) elevationGain += diff
        else elevationLoss += Math.abs(diff)
      }
    }
  }

  let avgSpeed = 0
  if (speedCount > 0) {
    avgSpeed = speedSum / speedCount
  } else if (locations.length > 1) {
    // Points reach here with no usable speed three ways: a chip reporting 0 on every fix, an
    // update interval past applySpeedFallback's 60s window, or an import whose source file
    // carried none. Without this the trip reads 0 next to a correct distance. Note this counts
    // stopped time, unlike the reported-speed branch above, which averages moving fixes only.
    const seconds = (locations[locations.length - 1].timestamp ?? 0) - (locations[0].timestamp ?? 0)
    if (seconds > 0) avgSpeed = computeTotalDistance(locations) / seconds
  }

  return {
    avgSpeed,
    elevationGain,
    elevationLoss
  }
}
