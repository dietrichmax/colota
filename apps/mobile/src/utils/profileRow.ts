/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { UserRoundPen, type LucideIcon } from "lucide-react-native"
import { PROFILE_CONDITIONS } from "../constants"
import type { SavedTrackingProfile, Settings, TrackingProfile } from "../types/global"
import {
  formatDuration,
  recordingPhrase as settingsRecordingPhrase,
  recordingSummary,
  syncSummary
} from "./dashboardState"
import { t } from "../i18n/t"
import { getSpeedUnit, speedToInput } from "./geo"

type ProfileLike = Pick<TrackingProfile, "condition" | "interval" | "distance" | "syncInterval">

export function conditionOf(profile: Pick<TrackingProfile, "condition">) {
  return PROFILE_CONDITIONS.find((c) => c.type === profile.condition.type) ?? PROFILE_CONDITIONS[0]
}

const speedOf = (profile: Pick<TrackingProfile, "condition">) =>
  `${speedToInput(profile.condition.speedThreshold ?? 0)} ${getSpeedUnit().unit}`

/** "When charging", "Speed above 50 km/h": the clause a row and the editor's sentence open with. */
export function conditionText(profile: Pick<TrackingProfile, "condition">): string {
  return t(conditionOf(profile).listKey, { speed: speedOf(profile) })
}

/** The recording half; a stationary profile forces the distance to 0, so "any movement" would mislead. */
export function recordingClause(profile: ProfileLike): string {
  if (profile.condition.type === "stationary") {
    return t("tracking.recording.whileStill", { duration: formatDuration(profile.interval) })
  }
  return recordingSummary(profile.interval, profile.distance)
}

/** `recordingClause` inside a sentence: "every 5 s while still". */
export function recordingPhrase(profile: ProfileLike): string {
  if (profile.condition.type === "stationary") {
    return t("tracking.phrase.whileStill", { duration: formatDuration(profile.interval) })
  }
  return settingsRecordingPhrase(profile.interval, profile.distance)
}

/** The one line under a profile's name: [Active · ]condition · recording · sync. */
export function profileRowSub(profile: ProfileLike, inForce: boolean, isOfflineMode: boolean): string {
  const condition = inForce
    ? t("profile.row.active", { condition: t(conditionOf(profile).clauseKey, { speed: speedOf(profile) }) })
    : conditionText(profile)
  const parts = [condition, recordingClause(profile)]
  if (!isOfflineMode) parts.push(syncSummary(profile.syncInterval))
  return parts.join(" · ")
}

/** The rule as one sentence, the editor's caption: "When charging, track every 5 s, any movement and sync each fix." */
export function profileSentence(profile: ProfileLike, isOfflineMode: boolean): string {
  const { type } = profile.condition
  const when =
    type === "speed_above"
      ? t("profile.when.faster", { speed: speedOf(profile) })
      : type === "speed_below"
        ? t("profile.when.slower", { speed: speedOf(profile) })
        : conditionText(profile)
  const recording = recordingPhrase(profile)
  if (isOfflineMode) return t("profile.sentence.offline", { when, recording })
  const sync =
    profile.syncInterval === 0
      ? t("tracking.syncVerb.eachFix")
      : t("tracking.syncVerb.every", { duration: formatDuration(profile.syncInterval) })
  return t("profile.sentence", { when, recording, sync })
}

/** "Charging is active" or "No profile active": the Profiles state line and the Settings row print one string. */
export function profileStateLabel(activeName: string | null | undefined, tracking: boolean): string {
  return tracking && activeName ? t("trackingSync.profileActive", { name: activeName }) : t("profile.noneActive")
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
      label: profileStateLabel(null, false),
      caption: t("profile.state.notTracking")
    }
  }
  if (activeProfile) {
    const sync = settings.isOfflineMode ? "" : ` · ${syncSummary(activeProfile.syncInterval)}`
    return {
      icon: conditionOf(activeProfile).icon,
      tone: "success",
      label: profileStateLabel(activeProfile.name, true),
      caption: t("trackingSync.inForce", { clause: `${recordingPhrase(activeProfile)}${sync}` })
    }
  }
  const sync = settings.isOfflineMode ? "" : ` · ${syncSummary(settings.syncInterval)}`
  return {
    icon: UserRoundPen,
    tone: "secondary",
    label: profileStateLabel(null, true),
    caption: t("profile.state.settingsApply", {
      summary: `${settingsRecordingPhrase(settings.interval, settings.distance)}${sync}`
    })
  }
}
