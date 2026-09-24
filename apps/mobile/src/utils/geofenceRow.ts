/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { Geofence } from "../types/global"
import { formatShortDistance } from "./geo"
import { t } from "../i18n/t"

/** The caption under a zone's name: what it does, and "Paused here" first when you stand in it. */
export function zoneRowSub(zone: Geofence, pausedHere: boolean): string {
  const parts: string[] = []
  if (pausedHere) parts.push(t("zone.pausedHere"))
  parts.push(formatShortDistance(zone.radius))
  if (!zone.pauseTracking) {
    // The pause modes are inert without the master switch, so naming them would promise a pause that never comes.
    parts.push(t("zone.recordingContinues"))
  } else {
    if (zone.pauseOnWifi) parts.push(t("zone.wifiPause"))
    if (zone.pauseOnMotionless) parts.push(t("zone.motionlessPause"))
  }
  return parts.join(" · ")
}
