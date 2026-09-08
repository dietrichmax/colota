/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { UserRoundPen, type LucideIcon } from "lucide-react-native"
import { PROFILE_CONDITIONS } from "../constants"
import type { SavedTrackingProfile, Settings, TrackingProfile } from "../types/global"
import { formatInterval, recordingSummary, syncSummary, trackingSummary } from "./dashboardState"
import { getSpeedUnit, speedToInput } from "./geo"

type ProfileLike = Pick<TrackingProfile, "condition" | "interval" | "distance" | "syncInterval">

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

export function conditionOf(profile: Pick<TrackingProfile, "condition">) {
  return PROFILE_CONDITIONS.find((c) => c.type === profile.condition.type) ?? PROFILE_CONDITIONS[0]
}

/** "When charging", "Speed above 50 km/h": the clause a row and the editor's sentence open with. */
export function conditionText(profile: Pick<TrackingProfile, "condition">): string {
  const { type, speedThreshold } = profile.condition
  if (type === "speed_above" || type === "speed_below") {
    return `${conditionOf(profile).listLabel} ${speedToInput(speedThreshold ?? 0)} ${getSpeedUnit().unit}`
  }
  return conditionOf(profile).listLabel
}

/** The recording half; a stationary profile forces the distance to 0, so "any movement" would mislead. */
export function recordingClause(profile: ProfileLike): string {
  if (profile.condition.type === "stationary") return `${formatInterval(profile.interval)} while still`
  return recordingSummary(profile.interval, profile.distance)
}

/** The one line under a profile's name: [Active · ]condition · recording · sync. */
export function profileRowSub(profile: ProfileLike, inForce: boolean, isOfflineMode: boolean): string {
  const condition = conditionText(profile)
  const parts = [inForce ? `Active · ${lowerFirst(condition)}` : condition, recordingClause(profile)]
  if (!isOfflineMode) parts.push(syncSummary(profile.syncInterval))
  return parts.join(" · ")
}

/** The rule as one sentence, the editor's caption: "When charging, track every 5 s, any movement and sync each fix." */
export function profileSentence(profile: ProfileLike, isOfflineMode: boolean): string {
  const { type, speedThreshold } = profile.condition
  const unit = getSpeedUnit().unit
  const when =
    type === "speed_above"
      ? `When faster than ${speedToInput(speedThreshold ?? 0)} ${unit}`
      : type === "speed_below"
        ? `When slower than ${speedToInput(speedThreshold ?? 0)} ${unit}`
        : conditionText(profile)
  const track = `track ${lowerFirst(recordingClause(profile))}`
  if (isOfflineMode) return `${when}, ${track}.`
  return `${when}, ${track} and ${syncSummary(profile.syncInterval).replace(/^syncs/, "sync")}.`
}

export interface ProfileState {
  icon: LucideIcon
  tone: "success" | "secondary"
  label: string
  caption: string
}

/** The list's first row: which profile is in force, or what applies instead. */
export function describeProfileState(
  activeProfile: SavedTrackingProfile | null,
  settings: Pick<Settings, "interval" | "distance" | "syncInterval" | "isOfflineMode">,
  tracking: boolean
): ProfileState {
  if (!tracking) {
    return {
      icon: UserRoundPen,
      tone: "secondary",
      label: "No profile active",
      caption: "Profiles apply while tracking runs"
    }
  }
  if (activeProfile) {
    const sync = settings.isOfflineMode ? "" : ` · ${syncSummary(activeProfile.syncInterval)}`
    return {
      icon: conditionOf(activeProfile).icon,
      tone: "success",
      label: `${activeProfile.name} is active`,
      caption: `In force: ${lowerFirst(recordingClause(activeProfile))}${sync}`
    }
  }
  return {
    icon: UserRoundPen,
    tone: "secondary",
    label: "No profile active",
    caption: `Tracking & sync applies: ${lowerFirst(trackingSummary(settings.interval, settings.distance, settings.syncInterval, settings.isOfflineMode))}`
  }
}
