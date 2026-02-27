/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { computeTotalDistance } from "./geo"
import type { Trip, LocationCoords } from "../types/global"

export const TRIP_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]

export function getTripColor(index: number): string {
  return TRIP_COLORS[(index - 1) % TRIP_COLORS.length]
}

const DEFAULT_GAP_SECONDS = 900 // 15 minutes
const MIN_TRIP_POINTS = 2

/**
 * Segments a chronologically-sorted array of locations into trips.
 * A new trip starts when the time gap between consecutive points
 * exceeds gapThresholdSeconds.
 */
export function segmentTrips(locations: LocationCoords[], gapThresholdSeconds: number = DEFAULT_GAP_SECONDS): Trip[] {
  if (locations.length === 0) return []

  const trips: Trip[] = []
  let currentTripLocations: LocationCoords[] = [locations[0]]

  for (let i = 1; i < locations.length; i++) {
    const prevTs = locations[i - 1].timestamp ?? 0
    const currTs = locations[i].timestamp ?? 0

    if (currTs - prevTs >= gapThresholdSeconds) {
      trips.push(buildTrip(currentTripLocations))
      currentTripLocations = [locations[i]]
    } else {
      currentTripLocations.push(locations[i])
    }
  }

  if (currentTripLocations.length > 0) {
    trips.push(buildTrip(currentTripLocations))
  }

  // Filter out single-point "trips" (stray GPS fixes during long stops)
  const filtered = trips.filter((t) => t.locationCount >= MIN_TRIP_POINTS)
  // Re-index after filtering
  return filtered.map((t, i) => ({ ...t, index: i + 1 }))
}

function buildTrip(locations: LocationCoords[]): Trip {
  return {
    index: 0,
    locations,
    startTime: locations[0].timestamp ?? 0,
    endTime: locations[locations.length - 1].timestamp ?? 0,
    distance: computeTotalDistance(locations),
    locationCount: locations.length
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

  return {
    avgSpeed: speedCount > 0 ? speedSum / speedCount : 0,
    elevationGain,
    elevationLoss
  }
}
