/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

export const API_TEMPLATE_NAMES = [
  "custom",
  "dawarich",
  "geopulse",
  "overland",
  "owntracks",
  "phonetrack",
  "reitti",
  "traccar"
] as const
export type ApiTemplateName = (typeof API_TEMPLATE_NAMES)[number]

export const HTTP_METHODS = ["POST", "GET"] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export const DAWARICH_MODES = ["single", "batch"] as const
export type DawarichMode = (typeof DAWARICH_MODES)[number]

export const ACCURACY_MODES = ["high", "balanced"] as const
export type AccuracyMode = (typeof ACCURACY_MODES)[number]

export const SYNC_CONDITIONS = ["any", "wifi_any", "wifi_ssid", "vpn"] as const
export type SyncCondition = (typeof SYNC_CONDITIONS)[number]

export const AUTH_TYPES = ["none", "basic", "bearer"] as const
export type AuthType = (typeof AUTH_TYPES)[number]

export const PROFILE_CONDITION_TYPES = [
  "charging",
  "android_auto",
  "bluetooth_device",
  "speed_above",
  "speed_below",
  "stationary",
  "wifi_any",
  "wifi_ssid"
] as const
export type ProfileConditionType = (typeof PROFILE_CONDITION_TYPES)[number]

// Overland batch envelope (Dawarich + batch mode, Overland template)
export const OVERLAND_BATCH_MIN = 1
export const OVERLAND_BATCH_MAX = 500

export function buildSetupLinkFromConfig(config: Record<string, unknown>): string {
  return `colota://setup?config=${btoa(JSON.stringify(config))}`
}

// React Navigation's query parser decodes `+` as a space, and base64 has no spaces, so every space was a `+`.
export function decodeConfig(param: string): unknown {
  return JSON.parse(atob(param.replace(/ /g, "+")))
}
