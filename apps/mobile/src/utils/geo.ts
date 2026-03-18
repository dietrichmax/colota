/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import NativeLocationService from "../services/NativeLocationService"

const EARTH_RADIUS_METERS = 6_371_000
const FEET_PER_METER = 3.28084
const MPH_PER_MPS = 2.23694

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

// -- Display preferences (cached from SQLite) --

export type UnitSystem = "metric" | "imperial"
export type TimeFormat = "12h" | "24h"

let cachedUnitSystem: UnitSystem | null = null
let cachedTimeFormat: TimeFormat | null = null

/** Detect whether the device locale uses 12h time. */
function localeUses12h(): boolean {
  try {
    const sample = new Date(2000, 0, 1, 14).toLocaleTimeString(undefined, { hour: "numeric" })
    return /am|pm/i.test(sample)
  } catch {
    return false
  }
}

/** Load display preferences from native storage. Call on app start and after saving. */
export async function loadDisplayPreferences(): Promise<void> {
  try {
    const [unit, time] = await Promise.all([
      NativeLocationService.getSetting("unitSystem", ""),
      NativeLocationService.getSetting("timeFormat", "")
    ])
    cachedUnitSystem = unit === "metric" || unit === "imperial" ? unit : null
    cachedTimeFormat = time === "12h" || time === "24h" ? time : null
  } catch {
    // Keep defaults on error
  }
}

// -- Unit detection --

const MILE_LOCALES = new Set(["en-US", "en-GB", "en-MM", "en-LR"])

function localeUsesMiles(): boolean {
  try {
    const locale = Intl.NumberFormat().resolvedOptions().locale.split("-").slice(0, 2).join("-")
    return MILE_LOCALES.has(locale)
  } catch {
    return false
  }
}

export function getUnitSystem(): UnitSystem {
  return cachedUnitSystem ?? (localeUsesMiles() ? "imperial" : "metric")
}

export function getTimeFormat(): TimeFormat {
  return cachedTimeFormat ?? (localeUses12h() ? "12h" : "24h")
}

function usesMiles(): boolean {
  return getUnitSystem() === "imperial"
}

// -- Formatting functions --

/** Format m/s into a human-readable speed string. */
export function formatSpeed(metersPerSecond: number): string {
  if (usesMiles()) {
    const mph = metersPerSecond * MPH_PER_MPS
    return `${mph.toFixed(1)} mph`
  }
  const kmh = metersPerSecond * 3.6
  return `${kmh.toFixed(1)} km/h`
}

/** Return the speed unit info (used by TrackMap). */
export function getSpeedUnit(): { factor: number; unit: string } {
  return usesMiles() ? { factor: MPH_PER_MPS, unit: "mph" } : { factor: 3.6, unit: "km/h" }
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
    ...(showSeconds && { second: "2-digit" }),
    ...(cachedTimeFormat && { hour12: cachedTimeFormat === "12h" })
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

/** Format meters as a long distance string (e.g. "12.3 km" / "7.6 mi"). */
export function formatDistance(meters: number): string {
  if (usesMiles()) return `${(meters / 1609.344).toFixed(1)} mi`
  return `${(meters / 1000).toFixed(1)} km`
}

/** Format meters as a short distance string (e.g. "50m" / "164 ft"). */
export function formatShortDistance(meters: number): string {
  if (usesMiles()) return `${Math.round(meters * FEET_PER_METER)} ft`
  return `${Math.round(meters)}m`
}

/** Returns the short distance unit label for input fields ("m" or "ft"). */
export function shortDistanceUnit(): string {
  return usesMiles() ? "ft" : "m"
}

/** Convert a user-entered short distance to meters. */
export function inputToMeters(value: number): number {
  return usesMiles() ? value / FEET_PER_METER : value
}

/** Convert meters to the user's short distance unit for pre-filling inputs. */
export function metersToInput(meters: number): number {
  return usesMiles() ? Math.round(meters * FEET_PER_METER) : meters
}
