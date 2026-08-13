/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { computeTotalDistance, haversine } from "./geo"
import type { Trip, LocationCoords } from "../types/global"

export const TRIP_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]

export function getTripColor(index: number): string {
  return TRIP_COLORS[(index - 1) % TRIP_COLORS.length]
}

const DEFAULT_GAP_SECONDS = 900 // 15 minutes
// Total distance is no use here - stationary fixes accumulate it without moving
const MIN_TRIP_EXTENT_METERS = 100 // bbox diagonal, matches DatabaseHelper.getDailyStats

/**
 * Segments a chronologically-sorted array of locations into trips.
 * A new trip starts when the time gap between consecutive points
 * exceeds gapThresholdSeconds.
 */
export function segmentTrips(locations: LocationCoords[], gapThresholdSeconds: number = DEFAULT_GAP_SECONDS): Trip[] {
  if (locations.length === 0) return []

  const trips: Trip[] = []
  let startIndex = 0
  let currentTripLocations: LocationCoords[] = [locations[0]]

  for (let i = 1; i < locations.length; i++) {
    const prevTs = locations[i - 1].timestamp ?? 0
    const currTs = locations[i].timestamp ?? 0

    if (currTs - prevTs >= gapThresholdSeconds) {
      trips.push(buildTrip(currentTripLocations, startIndex))
      startIndex = i
      currentTripLocations = [locations[i]]
    } else {
      currentTripLocations.push(locations[i])
    }
  }

  if (currentTripLocations.length > 0) {
    trips.push(buildTrip(currentTripLocations, startIndex))
  }

  // Drops stray fixes during long stops as well as stationary runs
  const filtered = trips.filter((t) => trackExtent(t.locations) >= MIN_TRIP_EXTENT_METERS)
  // Re-index after filtering
  return filtered.map((t, i) => ({ ...t, index: i + 1 }))
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
