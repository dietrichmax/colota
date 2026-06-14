/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { OVERLAND_BATCH_MIN, OVERLAND_BATCH_MAX, defaultProfileDelays, PROFILE_CONDITIONS } from "../constants"
import { isEndpointAllowed } from "./settingsValidation"
import {
  TRACKING_PRESETS,
  API_TEMPLATES,
  type Settings,
  type AuthConfig,
  type FieldMap,
  type CustomField,
  type ApiTemplateName,
  type HttpMethod,
  type DawarichMode,
  type SelectablePreset,
  type SyncPreset,
  type Geofence,
  type TrackingProfile,
  type ProfileConditionType,
  type AuthType
} from "../types/global"

export type ImportGeofence = Omit<Geofence, "id" | "createdAt">
export type ImportProfile = Omit<TrackingProfile, "id" | "createdAt">

export interface ParsedConfig {
  settings: Partial<Settings>
  auth: Partial<AuthConfig> | null
  geofences: ImportGeofence[]
  profiles: ImportProfile[]
}

export interface ConfigEntry {
  label: string
  value: string
  category: "tracking" | "api" | "auth" | "geofence" | "profile"
  rejected?: boolean
}

export interface ValidationResult {
  valid: boolean
  config: ParsedConfig
  entries: ConfigEntry[]
  error?: string
}

const VALID_API_TEMPLATES = ["custom", ...Object.keys(API_TEMPLATES)] as ApiTemplateName[]
const VALID_HTTP_METHODS: HttpMethod[] = ["POST", "GET"]
const VALID_DAWARICH_MODES: DawarichMode[] = ["single", "batch"]
const VALID_AUTH_TYPES: AuthType[] = ["none", "basic", "bearer"]

const VALID_PROFILE_CONDITIONS = PROFILE_CONDITIONS.map((c) => c.type)

export function detectPreset(settings: Partial<Settings>): SyncPreset {
  for (const [name, config] of Object.entries(TRACKING_PRESETS)) {
    if (
      settings.interval === config.interval &&
      settings.distance === config.distance &&
      settings.syncInterval === config.syncInterval &&
      settings.retryInterval === config.retryInterval
    ) {
      return name as SelectablePreset
    }
  }
  return "custom"
}

export function validateConfig(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      config: { settings: {}, auth: null, geofences: [], profiles: [] },
      entries: [],
      error: "Invalid configuration format"
    }
  }

  const obj = raw as Record<string, unknown>
  const settings: Partial<Settings> = {}
  const entries: ConfigEntry[] = []
  let auth: Partial<AuthConfig> | null = null

  // --- API settings (endpoint) ---

  if ("endpoint" in obj && typeof obj.endpoint === "string" && obj.endpoint.length > 0) {
    if (isEndpointAllowed(obj.endpoint)) {
      settings.endpoint = obj.endpoint
      entries.push({ label: "Endpoint", value: obj.endpoint, category: "api" })
    } else {
      entries.push({ label: "Endpoint", value: "HTTP not allowed for public hosts", category: "api", rejected: true })
    }
  }

  // --- Tracking settings ---

  if ("interval" in obj && typeof obj.interval === "number" && obj.interval > 0) {
    settings.interval = obj.interval
    entries.push({ label: "Interval", value: `${obj.interval}s`, category: "tracking" })
  }

  if ("distance" in obj && typeof obj.distance === "number" && obj.distance >= 0) {
    settings.distance = obj.distance
    entries.push({ label: "Distance threshold", value: `${obj.distance}m`, category: "tracking" })
  }

  if ("syncInterval" in obj && typeof obj.syncInterval === "number" && obj.syncInterval >= 0) {
    settings.syncInterval = obj.syncInterval
    entries.push({
      label: "Sync interval",
      value: obj.syncInterval === 0 ? "Instant" : `${obj.syncInterval}s`,
      category: "tracking"
    })
  }

  if ("retryInterval" in obj && typeof obj.retryInterval === "number" && obj.retryInterval >= 0) {
    settings.retryInterval = obj.retryInterval
    entries.push({ label: "Retry interval", value: `${obj.retryInterval}s`, category: "tracking" })
  }

  if ("accuracyThreshold" in obj && typeof obj.accuracyThreshold === "number" && obj.accuracyThreshold > 0) {
    settings.accuracyThreshold = obj.accuracyThreshold
    entries.push({ label: "Accuracy threshold", value: `${obj.accuracyThreshold}m`, category: "tracking" })
  }

  if ("filterInaccurateLocations" in obj && typeof obj.filterInaccurateLocations === "boolean") {
    settings.filterInaccurateLocations = obj.filterInaccurateLocations
    entries.push({
      label: "Filter inaccurate",
      value: obj.filterInaccurateLocations ? "Yes" : "No",
      category: "tracking"
    })
  }

  if ("isOfflineMode" in obj && typeof obj.isOfflineMode === "boolean") {
    settings.isOfflineMode = obj.isOfflineMode
    entries.push({ label: "Offline mode", value: obj.isOfflineMode ? "Yes" : "No", category: "tracking" })
  }

  if ("syncCondition" in obj && typeof obj.syncCondition === "string") {
    settings.syncCondition = obj.syncCondition as any
    entries.push({ label: "Sync condition", value: obj.syncCondition, category: "tracking" })
  }

  if ("syncSsid" in obj && typeof obj.syncSsid === "string") {
    settings.syncSsid = obj.syncSsid
    entries.push({ label: "Sync SSID", value: obj.syncSsid, category: "tracking" })
  }

  // --- API settings ---

  if (
    "apiTemplate" in obj &&
    typeof obj.apiTemplate === "string" &&
    VALID_API_TEMPLATES.includes(obj.apiTemplate as ApiTemplateName)
  ) {
    settings.apiTemplate = obj.apiTemplate as ApiTemplateName
    entries.push({ label: "API template", value: obj.apiTemplate, category: "api" })
  }

  if (
    "httpMethod" in obj &&
    typeof obj.httpMethod === "string" &&
    VALID_HTTP_METHODS.includes(obj.httpMethod as HttpMethod)
  ) {
    settings.httpMethod = obj.httpMethod as HttpMethod
    entries.push({ label: "HTTP method", value: obj.httpMethod, category: "api" })
  }

  if (
    "dawarichMode" in obj &&
    typeof obj.dawarichMode === "string" &&
    VALID_DAWARICH_MODES.includes(obj.dawarichMode as DawarichMode)
  ) {
    settings.dawarichMode = obj.dawarichMode as DawarichMode
    entries.push({ label: "Dawarich mode", value: obj.dawarichMode, category: "api" })
  }

  if (
    "overlandBatchSize" in obj &&
    typeof obj.overlandBatchSize === "number" &&
    obj.overlandBatchSize >= OVERLAND_BATCH_MIN &&
    obj.overlandBatchSize <= OVERLAND_BATCH_MAX
  ) {
    settings.overlandBatchSize = Math.floor(obj.overlandBatchSize)
    entries.push({ label: "Overland batch size", value: String(settings.overlandBatchSize), category: "api" })
  }

  if ("fieldMap" in obj && typeof obj.fieldMap === "object" && obj.fieldMap !== null) {
    const fm = obj.fieldMap as Record<string, unknown>
    const validFieldMap: Partial<FieldMap> = {}
    let hasValid = false
    for (const [key, val] of Object.entries(fm)) {
      if (typeof val === "string") {
        ;(validFieldMap as any)[key] = val
        hasValid = true
      }
    }
    if (hasValid) {
      settings.fieldMap = validFieldMap as FieldMap
      entries.push({ label: "Field mapping", value: `${Object.keys(validFieldMap).length} fields`, category: "api" })
    }
  }

  if ("customFields" in obj && Array.isArray(obj.customFields)) {
    const validFields: CustomField[] = obj.customFields.filter(
      (f: any) => f && typeof f.key === "string" && typeof f.value === "string" && f.key.length > 0
    )
    if (validFields.length > 0) {
      settings.customFields = validFields
      entries.push({ label: "Custom fields", value: `${validFields.length} fields`, category: "api" })
    }
  }

  // --- Auth settings ---

  if ("auth" in obj && typeof obj.auth === "object" && obj.auth !== null) {
    const authObj = obj.auth as Record<string, unknown>
    auth = {}

    if ("type" in authObj && typeof authObj.type === "string" && VALID_AUTH_TYPES.includes(authObj.type as AuthType)) {
      auth.authType = authObj.type as AuthType
      entries.push({ label: "Auth type", value: authObj.type, category: "auth" })
    }

    if ("username" in authObj && typeof authObj.username === "string" && authObj.username.length > 0) {
      auth.username = authObj.username
      entries.push({ label: "Username", value: authObj.username, category: "auth" })
    }

    if ("password" in authObj && typeof authObj.password === "string" && authObj.password.length > 0) {
      auth.password = authObj.password
      entries.push({ label: "Password", value: "•".repeat(8), category: "auth" })
    }

    if ("bearerToken" in authObj && typeof authObj.bearerToken === "string" && authObj.bearerToken.length > 0) {
      auth.bearerToken = authObj.bearerToken
      const masked =
        authObj.bearerToken.length > 8
          ? authObj.bearerToken.slice(0, 4) + "•".repeat(4) + authObj.bearerToken.slice(-4)
          : "•".repeat(authObj.bearerToken.length)
      entries.push({ label: "Bearer token", value: masked, category: "auth" })
    }

    if (Object.keys(auth).length === 0) auth = null
  }

  if ("customHeaders" in obj && typeof obj.customHeaders === "object" && obj.customHeaders !== null) {
    const headers = obj.customHeaders as Record<string, unknown>
    const validHeaders: Record<string, string> = {}
    for (const [key, val] of Object.entries(headers)) {
      if (typeof val === "string") {
        validHeaders[key] = val
      }
    }
    if (Object.keys(validHeaders).length > 0) {
      if (!auth) auth = {}
      auth.customHeaders = validHeaders
      entries.push({ label: "Custom headers", value: `${Object.keys(validHeaders).length} headers`, category: "auth" })
    }
  }

  // --- Geofences ---

  const geofences: ImportGeofence[] = []

  if ("geofences" in obj && Array.isArray(obj.geofences)) {
    for (const entry of obj.geofences) {
      if (!entry || typeof entry !== "object") continue
      const g = entry as Record<string, unknown>
      if (
        typeof g.name !== "string" ||
        g.name.length === 0 ||
        typeof g.lat !== "number" ||
        typeof g.lon !== "number" ||
        typeof g.radius !== "number" ||
        g.radius <= 0
      ) {
        continue
      }
      geofences.push({
        name: g.name,
        lat: g.lat,
        lon: g.lon,
        radius: g.radius,
        enabled: typeof g.enabled === "boolean" ? g.enabled : true,
        pauseTracking: typeof g.pauseTracking === "boolean" ? g.pauseTracking : false,
        pauseOnWifi: typeof g.pauseOnWifi === "boolean" ? g.pauseOnWifi : false,
        pauseOnMotionless: typeof g.pauseOnMotionless === "boolean" ? g.pauseOnMotionless : false,
        motionlessTimeoutMinutes: typeof g.motionlessTimeoutMinutes === "number" ? g.motionlessTimeoutMinutes : 10,
        heartbeatEnabled: typeof g.heartbeatEnabled === "boolean" ? g.heartbeatEnabled : false,
        heartbeatIntervalMinutes: typeof g.heartbeatIntervalMinutes === "number" ? g.heartbeatIntervalMinutes : 15
      })
      entries.push({ label: g.name, value: `${g.radius}m`, category: "geofence" })
    }
  }

  // --- Tracking Profiles ---

  const profiles: ImportProfile[] = []

  if ("profiles" in obj && Array.isArray(obj.profiles)) {
    for (const entry of obj.profiles) {
      if (!entry || typeof entry !== "object") continue
      const p = entry as Record<string, unknown>
      if (
        typeof p.name !== "string" ||
        p.name.length === 0 ||
        typeof p.interval !== "number" ||
        p.interval < 1 ||
        typeof p.distance !== "number" ||
        p.distance < 0 ||
        typeof p.syncInterval !== "number" ||
        p.syncInterval < 0
      ) {
        continue
      }

      const condRaw = p.condition as Record<string, unknown> | undefined
      if (!condRaw || typeof condRaw !== "object" || typeof condRaw.type !== "string") continue
      if (!VALID_PROFILE_CONDITIONS.includes(condRaw.type as ProfileConditionType)) continue
      const condType = condRaw.type as ProfileConditionType
      const needsSpeed = condType === "speed_above" || condType === "speed_below"
      if (needsSpeed && (typeof condRaw.speedThreshold !== "number" || condRaw.speedThreshold <= 0)) continue
      const condition: TrackingProfile["condition"] = needsSpeed
        ? { type: condType, speedThreshold: condRaw.speedThreshold as number }
        : { type: condType }

      const delays = defaultProfileDelays(condType)
      profiles.push({
        name: p.name,
        interval: p.interval,
        distance: p.distance,
        syncInterval: p.syncInterval,
        priority: typeof p.priority === "number" ? p.priority : 10,
        activationDelay:
          typeof p.activationDelay === "number" && p.activationDelay >= 0 ? p.activationDelay : delays.activationDelay,
        deactivationDelay:
          typeof p.deactivationDelay === "number" && p.deactivationDelay >= 0
            ? p.deactivationDelay
            : delays.deactivationDelay,
        enabled: typeof p.enabled === "boolean" ? p.enabled : true,
        condition
      })
      entries.push({ label: p.name, value: `${p.interval}s`, category: "profile" })
    }
  }

  if (entries.length === 0) {
    return {
      valid: false,
      config: { settings, auth, geofences, profiles },
      entries,
      error: "No valid settings found in configuration"
    }
  }

  return { valid: true, config: { settings, auth, geofences, profiles }, entries }
}
