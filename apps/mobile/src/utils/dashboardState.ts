/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { formatDate, formatTime, metersToInput, shortDistanceUnit, startOfDaySec } from "./geo"

export type BannerCondition = "permission" | "background" | "locationOff" | "battery"

export interface BannerInput {
  permissions: { location: boolean; background: boolean } | null
  locationEnabled: boolean
  isBatteryCritical: boolean
  tracking: boolean
}

export function pickBannerCondition({
  permissions,
  locationEnabled,
  isBatteryCritical,
  tracking
}: BannerInput): BannerCondition | null {
  if (permissions && !permissions.location) return "permission"
  if (permissions && tracking && !permissions.background) return "background"
  if (!locationEnabled) return "locationOff"
  if (isBatteryCritical && !tracking) return "battery"
  return null
}

export type StateIcon = "dashed" | "loader" | "circleDot" | "pause" | "alert"
export type StateTone = "secondary" | "primary" | "success" | "error"

export interface StateDescription {
  icon: StateIcon
  tone: StateTone
  label: string
  caption: string
}

export interface StateInput {
  tracking: boolean
  hasFix: boolean
  locationEnabled: boolean
  activeZoneName: string | null
  pauseReason: string | null
  activeProfileName: string | null
  coords: { accuracy: number; timestamp: number } | null
  lastKnown: { timestamp: number } | null
  stoppedByBattery: boolean
  now?: Date
}

const STOPPED_BY_BATTERY = "Battery fell below 5%"
const NO_FIX_YET = "No fix yet"
const LOCATION_OFF = "Location services are off"

function pauseCaption(zoneName: string, pauseReason: string | null): string {
  if (pauseReason === "wifi") return `${zoneName} WiFi · resumes when you leave`
  if (pauseReason === "motionless") return "No movement · resumes when you move"
  return "Inside zone · resumes when you leave"
}

export function describeState(input: StateInput): StateDescription {
  const { tracking, hasFix, locationEnabled, activeZoneName, pauseReason, activeProfileName, coords } = input

  if (!tracking) {
    if (input.stoppedByBattery) {
      return { icon: "alert", tone: "error", label: "Tracking stopped", caption: STOPPED_BY_BATTERY }
    }
    return {
      icon: "dashed",
      tone: "secondary",
      label: "Ready",
      caption: formatLastFix(input.lastKnown?.timestamp ?? null, input.now)
    }
  }

  if (activeZoneName) {
    return {
      icon: "pause",
      tone: "secondary",
      label: `Paused in ${activeZoneName}`,
      caption: pauseCaption(activeZoneName, pauseReason)
    }
  }

  if (!hasFix || !coords) {
    return {
      icon: "loader",
      tone: "primary",
      label: "Searching for GPS",
      caption: locationEnabled ? NO_FIX_YET : LOCATION_OFF
    }
  }

  const accuracy = Math.round(metersToInput(coords.accuracy))
  return {
    icon: "circleDot",
    tone: "success",
    label: activeProfileName ? `Tracking · ${activeProfileName}` : "Tracking",
    caption: `±${accuracy} ${shortDistanceUnit()} · ${formatTime(coords.timestamp)}`
  }
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} h`
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} s`
}

export function formatInterval(seconds: number): string {
  return `Every ${formatDuration(seconds)}`
}

export function intervalText(intervalSeconds: number, syncIntervalSeconds: number): string {
  const sync = syncIntervalSeconds === 0 ? "Instant sync" : `Sync ${formatDuration(syncIntervalSeconds)}`
  return `${formatInterval(intervalSeconds)} · ${sync}`
}

export function formatLastFix(timestampSeconds: number | null, now: Date = new Date()): string {
  if (timestampSeconds === null) return "No fixes yet"
  const sameDay = startOfDaySec(new Date(timestampSeconds * 1000)) === startOfDaySec(now)
  if (sameDay) return `Last fix ${formatTime(timestampSeconds)}`
  return `Last fix ${formatDate(timestampSeconds)} · ${formatTime(timestampSeconds)}`
}
