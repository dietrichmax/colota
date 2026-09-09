/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { MAP_STYLE_URL_LIGHT, MAP_STYLE_URL_DARK } from "../constants"
import { t } from "../i18n"
import type { ThemePreference } from "../hooks/useTheme"
import { formatTimeIn, type TimeFormat, type UnitSystem } from "./geo"
import { endpointHost } from "./serverState"
import { isEndpointAllowed } from "./settingsValidation"

/**
 * What each Appearance choice produces, as the words the rows print. Computed rather than
 * translated: this is the app's only translated screen, so a value costs a translator nothing.
 */

/** The units the choice puts on screen, in the order distance, speed then elevation. */
export function unitNotation(unit: UnitSystem): string {
  return unit === "imperial" ? "mi · mph · ft" : "km · km/h · m"
}

/** The current time in the chosen format, through the app's own formatter so it cannot drift. */
export function clockSample(format: TimeFormat, now: Date = new Date()): string {
  return formatTimeIn(Math.floor(now.getTime() / 1000), format)
}

/** The host actually serving tiles. One name when both styles agree, both when they do not. */
export function tileRowSub(light: string, dark: string): string {
  const lightHost = endpointHost(light.trim() || MAP_STYLE_URL_LIGHT)
  const darkHost = endpointHost(dark.trim() || MAP_STYLE_URL_DARK)
  return lightHost === darkHost ? lightHost : `${lightHost} · ${darkHost}`
}

/** Empty means the default, so only a non-empty value has to be a URL this app can load. */
export function isStyleUrlValid(text: string): boolean {
  const trimmed = text.trim()
  return trimmed === "" || isEndpointAllowed(trimmed)
}

/** The Settings hub row: what the app looks and reads like, and the tile host once one is stored. */
export function appearanceRowSub(
  preference: ThemePreference,
  unit: UnitSystem,
  format: TimeFormat,
  light = "",
  dark = ""
): string {
  const parts = [
    t(`appearance.theme.${preference}`),
    t(`appearance.units.${unit}`),
    t(`appearance.timeFormat.${format}`)
  ]
  if (light.trim() || dark.trim()) parts.push(tileRowSub(light, dark))
  return parts.join(" · ")
}
