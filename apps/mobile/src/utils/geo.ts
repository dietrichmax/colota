/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

const EARTH_RADIUS_METERS = 6371000.0

/** Haversine formula - mirrors GeofenceHelper.kt */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Sum of Haversine distances between consecutive points, in meters. */
export function computeTotalDistance(locations: { latitude: number; longitude: number }[]): number {
  let total = 0
  for (let i = 1; i < locations.length; i++) {
    total += haversine(
      locations[i - 1].latitude,
      locations[i - 1].longitude,
      locations[i].latitude,
      locations[i].longitude
    )
  }
  return total
}

const MILE_LOCALES = new Set(["en-US", "en-GB", "en-MM", "en-LR"])

function usesMiles(): boolean {
  try {
    const locale = Intl.NumberFormat().resolvedOptions().locale
    return MILE_LOCALES.has(locale)
  } catch {
    return false
  }
}

/** Format m/s into a human-readable speed string using the device locale's unit. */
export function formatSpeed(metersPerSecond: number): string {
  if (usesMiles()) {
    const mph = metersPerSecond * 2.23694
    return `${mph.toFixed(1)} mph`
  }
  const kmh = metersPerSecond * 3.6
  return `${kmh.toFixed(1)} km/h`
}

/** Return the speed unit info for the current locale (used by TrackMap). */
export function getSpeedUnit(): { factor: number; unit: string } {
  return usesMiles() ? { factor: 2.23694, unit: "mph" } : { factor: 3.6, unit: "km/h" }
}

/** Format seconds duration as "Xh Ym" or "Ym" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, seconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/** Format a Unix-seconds timestamp as a localized time string. */
export function formatTime(unixSeconds: number, showSeconds = false): string {
  const d = new Date(unixSeconds * 1000)
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(showSeconds && { second: "2-digit" })
  })
}

/** Format a Unix-seconds timestamp as a localized date string (e.g. "Wed, Feb 27"). */
export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  })
}

/** Format meters into a human-readable string using the device locale's unit. */
export function formatDistance(meters: number): string {
  if (usesMiles()) {
    const miles = meters / 1609.344
    return `${miles.toFixed(1)} mi`
  }
  const km = meters / 1000
  return `${km.toFixed(1)} km`
}
