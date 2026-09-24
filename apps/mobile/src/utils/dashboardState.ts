/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { formatTime, formatWhen, metersToInput, shortDistanceUnit } from "./geo"
import { t } from "../i18n/t"

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

function pauseCaption(zoneName: string, pauseReason: string | null): string {
  if (pauseReason === "wifi") return t("state.pause.wifi", { zone: zoneName })
  if (pauseReason === "motionless") return t("state.pause.motionless")
  return t("state.pause.zone")
}

export function describeState(input: StateInput): StateDescription {
  const { tracking, hasFix, locationEnabled, activeZoneName, pauseReason, activeProfileName, coords } = input

  if (!tracking) {
    if (input.stoppedByBattery) {
      return { icon: "alert", tone: "error", label: t("state.stopped"), caption: t("state.stoppedByBattery") }
    }
    return {
      icon: "dashed",
      tone: "secondary",
      label: t("state.ready"),
      caption: formatLastFix(input.lastKnown?.timestamp ?? null, input.now)
    }
  }

  if (activeZoneName) {
    return {
      icon: "pause",
      tone: "secondary",
      label: t("state.pausedIn", { zone: activeZoneName }),
      caption: pauseCaption(activeZoneName, pauseReason)
    }
  }

  if (!hasFix || !coords) {
    return {
      icon: "loader",
      tone: "primary",
      label: t("state.searching"),
      caption: locationEnabled ? t("state.noFixYet") : t("state.locationOff")
    }
  }

  const accuracy = Math.round(metersToInput(coords.accuracy))
  return {
    icon: "circleDot",
    tone: "success",
    label: activeProfileName ? t("state.trackingProfile", { profile: activeProfileName }) : t("state.tracking"),
    caption: `±${accuracy} ${shortDistanceUnit()} · ${formatTime(coords.timestamp)}`
  }
}

export function formatDuration(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} ${t("unit.h")}`
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} ${t("unit.min")}`
  return `${seconds} ${t("unit.s")}`
}

/** "Instant" for 0, the duration otherwise: the sync-interval rows and the profile editor's default. */
export function syncIntervalLabel(seconds: number): string {
  return seconds === 0 ? t("syncInterval.instant") : formatDuration(seconds)
}

export function formatInterval(seconds: number): string {
  return t("tracking.every", { duration: formatDuration(seconds) })
}

/** "Every 30 s after 2 m", or ", any movement" when no distance gates a fix. */
export function recordingSummary(intervalSeconds: number, distanceMeters: number): string {
  const duration = formatDuration(intervalSeconds)
  if (distanceMeters === 0) return t("tracking.recording.anyMovement", { duration })
  return t("tracking.recording.after", {
    duration,
    distance: `${metersToInput(distanceMeters)} ${shortDistanceUnit()}`
  })
}

/** "every 30 s after 2 m": the recording clause inside a sentence, where it does not open it. */
export function recordingPhrase(intervalSeconds: number, distanceMeters: number): string {
  const duration = formatDuration(intervalSeconds)
  if (distanceMeters === 0) return t("tracking.phrase.anyMovement", { duration })
  return t("tracking.phrase.after", {
    duration,
    distance: `${metersToInput(distanceMeters)} ${shortDistanceUnit()}`
  })
}

/** "syncs each fix" or "syncs every 5 min", lower case so a caption can carry it. */
export function syncSummary(syncIntervalSeconds: number): string {
  return syncIntervalSeconds === 0
    ? t("tracking.sync.eachFix")
    : t("tracking.sync.every", { duration: formatDuration(syncIntervalSeconds) })
}

/** The one line a preset row, the Custom row and the Settings row all print for a configuration. */
export function trackingSummary(
  intervalSeconds: number,
  distanceMeters: number,
  syncIntervalSeconds: number,
  isOfflineMode: boolean
): string {
  const recording = recordingSummary(intervalSeconds, distanceMeters)
  return isOfflineMode ? recording : `${recording} · ${syncSummary(syncIntervalSeconds)}`
}

export function intervalText(intervalSeconds: number, syncIntervalSeconds: number): string {
  const sync =
    syncIntervalSeconds === 0
      ? t("tracking.interval.instantSync")
      : t("tracking.interval.sync", { duration: formatDuration(syncIntervalSeconds) })
  return `${formatInterval(intervalSeconds)} · ${sync}`
}

export function formatLastFix(timestampSeconds: number | null, now: Date = new Date()): string {
  if (timestampSeconds === null) return t("state.noFixes")
  return t("state.lastFix", { when: formatWhen(timestampSeconds, now) })
}
