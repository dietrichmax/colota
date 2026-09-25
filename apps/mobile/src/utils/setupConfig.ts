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
  type AuthType,
  type SyncCondition
} from "../types/global"
import { t } from "../i18n/t"
import type { TranslationKey } from "../i18n/options"
import { formatDuration, syncIntervalLabel } from "./dashboardState"
import { formatShortDistance } from "./geo"

const SYNC_CONDITION_KEYS: Record<SyncCondition, TranslationKey> = {
  any: "trackingSync.condition.any",
  wifi_any: "trackingSync.condition.wifiAny",
  wifi_ssid: "trackingSync.condition.wifiSsid",
  vpn: "trackingSync.condition.vpn"
}

export type ImportGeofence = Omit<Geofence, "id" | "createdAt">
export type ImportProfile = Omit<TrackingProfile, "id" | "createdAt">

export interface ParsedConfig {
  settings: Partial<Settings>
  auth: Partial<AuthConfig> | null
  geofences: ImportGeofence[]
  profiles: ImportProfile[]
}

export interface ConfigEntry {
  /** A stable id; `label` is display text and translates, so never compare it. */
  field: string
  label: string
  value: string
  category: "tracking" | "api" | "auth" | "geofence" | "profile"
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

/** The host a setup link's endpoint sends to, or null when userinfo or a backslash would let parsers disagree on it. */
export function setupEndpointHost(endpoint: string): string | null {
  const authority = /^https?:\/\/([^/?#]*)/i.exec(endpoint)?.[1]
  if (!authority || /[@\\\s]/.test(authority)) return null
  return authority
}

export function validateConfig(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      config: { settings: {}, auth: null, geofences: [], profiles: [] },
      entries: [],
      error: t("setup.err.format")
    }
  }

  const obj = raw as Record<string, unknown>
  const settings: Partial<Settings> = {}
  const entries: ConfigEntry[] = []
  let auth: Partial<AuthConfig> | null = null

  // --- API settings (endpoint) ---

  if ("endpoint" in obj && typeof obj.endpoint === "string" && obj.endpoint.length > 0) {
    const rejection = !isEndpointAllowed(obj.endpoint)
      ? t("setup.err.publicHttp")
      : setupEndpointHost(obj.endpoint) === null
        ? t("setup.err.host")
        : null
    // A link is written by someone else, so one rejected address rejects all of it rather than applying the rest.
    if (rejection) {
      return {
        valid: false,
        config: { settings: {}, auth: null, geofences: [], profiles: [] },
        entries: [],
        error: t("setup.err.rejected", { reason: rejection })
      }
    }
    settings.endpoint = obj.endpoint
    entries.push({ field: "endpoint", label: t("setup.field.endpoint"), value: obj.endpoint, category: "api" })
  }

  // --- Tracking settings ---

  if ("interval" in obj && typeof obj.interval === "number" && obj.interval > 0) {
    settings.interval = obj.interval
    entries.push({
      field: "interval",
      label: t("setup.field.interval"),
      value: formatDuration(obj.interval),
      category: "tracking"
    })
  }

  if ("distance" in obj && typeof obj.distance === "number" && obj.distance >= 0) {
    settings.distance = obj.distance
    entries.push({
      field: "distanceThreshold",
      label: t("setup.field.distanceThreshold"),
      value: formatShortDistance(obj.distance),
      category: "tracking"
    })
  }

  if ("syncInterval" in obj && typeof obj.syncInterval === "number" && obj.syncInterval >= 0) {
    settings.syncInterval = obj.syncInterval
    entries.push({
      field: "syncInterval",
      label: t("setup.field.syncInterval"),
      value: syncIntervalLabel(obj.syncInterval),
      category: "tracking"
    })
  }

  if ("retryInterval" in obj && typeof obj.retryInterval === "number" && obj.retryInterval >= 0) {
    settings.retryInterval = obj.retryInterval
    entries.push({
      field: "retryInterval",
      label: t("setup.field.retryInterval"),
      value: formatDuration(obj.retryInterval),
      category: "tracking"
    })
  }

  if ("accuracyThreshold" in obj && typeof obj.accuracyThreshold === "number" && obj.accuracyThreshold > 0) {
    settings.accuracyThreshold = obj.accuracyThreshold
    entries.push({
      field: "accuracyThreshold",
      label: t("setup.field.accuracyThreshold"),
      value: formatShortDistance(obj.accuracyThreshold),
      category: "tracking"
    })
  }

  if ("filterInaccurateLocations" in obj && typeof obj.filterInaccurateLocations === "boolean") {
    settings.filterInaccurateLocations = obj.filterInaccurateLocations
    entries.push({
      field: "filterInaccurate",
      label: t("setup.field.filterInaccurate"),
      value: obj.filterInaccurateLocations ? t("common.yes") : t("common.no"),
      category: "tracking"
    })
  }

  if ("isOfflineMode" in obj && typeof obj.isOfflineMode === "boolean") {
    settings.isOfflineMode = obj.isOfflineMode
    entries.push({
      field: "offlineMode",
      label: t("setup.field.offlineMode"),
      value: obj.isOfflineMode ? t("common.yes") : t("common.no"),
      category: "tracking"
    })
  }

  if ("syncCondition" in obj && typeof obj.syncCondition === "string") {
    settings.syncCondition = obj.syncCondition as any
    entries.push({
      field: "syncCondition",
      label: t("setup.field.syncCondition"),
      value: Object.prototype.hasOwnProperty.call(SYNC_CONDITION_KEYS, obj.syncCondition)
        ? t(SYNC_CONDITION_KEYS[obj.syncCondition as SyncCondition])
        : obj.syncCondition,
      category: "tracking"
    })
  }

  if ("syncSsid" in obj && typeof obj.syncSsid === "string") {
    settings.syncSsid = obj.syncSsid
    entries.push({ field: "syncSSID", label: t("setup.field.syncSSID"), value: obj.syncSsid, category: "tracking" })
  }

  // --- API settings ---

  if (
    "apiTemplate" in obj &&
    typeof obj.apiTemplate === "string" &&
    VALID_API_TEMPLATES.includes(obj.apiTemplate as ApiTemplateName)
  ) {
    settings.apiTemplate = obj.apiTemplate as ApiTemplateName
    entries.push({
      field: "apiTemplate",
      label: t("setup.field.apiTemplate"),
      value:
        obj.apiTemplate === "custom"
          ? t("common.custom")
          : API_TEMPLATES[obj.apiTemplate as Exclude<ApiTemplateName, "custom">].label,
      category: "api"
    })
  }

  if (
    "httpMethod" in obj &&
    typeof obj.httpMethod === "string" &&
    VALID_HTTP_METHODS.includes(obj.httpMethod as HttpMethod)
  ) {
    settings.httpMethod = obj.httpMethod as HttpMethod
    entries.push({ field: "httpMethod", label: t("setup.field.httpMethod"), value: obj.httpMethod, category: "api" })
  }

  if (
    "dawarichMode" in obj &&
    typeof obj.dawarichMode === "string" &&
    VALID_DAWARICH_MODES.includes(obj.dawarichMode as DawarichMode)
  ) {
    settings.dawarichMode = obj.dawarichMode as DawarichMode
    entries.push({
      field: "dawarichMode",
      label: t("setup.field.dawarichMode"),
      value: t(`requestFormat.dawarich.${obj.dawarichMode as DawarichMode}`),
      category: "api"
    })
  }

  if (
    "overlandBatchSize" in obj &&
    typeof obj.overlandBatchSize === "number" &&
    obj.overlandBatchSize >= OVERLAND_BATCH_MIN &&
    obj.overlandBatchSize <= OVERLAND_BATCH_MAX
  ) {
    settings.overlandBatchSize = Math.floor(obj.overlandBatchSize)
    entries.push({
      field: "overlandBatchSize",
      label: t("setup.field.overlandBatchSize"),
      value: String(settings.overlandBatchSize),
      category: "api"
    })
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
      entries.push({
        field: "fieldMapping",
        label: t("setup.field.fieldMapping"),
        value: t("setup.fields", { count: Object.keys(validFieldMap).length, n: Object.keys(validFieldMap).length }),
        category: "api"
      })
    }
  }

  if ("customFields" in obj && Array.isArray(obj.customFields)) {
    const validFields: CustomField[] = obj.customFields.filter(
      (f: any) => f && typeof f.key === "string" && typeof f.value === "string" && f.key.length > 0
    )
    if (validFields.length > 0) {
      settings.customFields = validFields
      entries.push({
        field: "customFields",
        label: t("setup.field.customFields"),
        value: t("setup.fields", { count: validFields.length, n: validFields.length }),
        category: "api"
      })
    }
  }

  // --- Auth settings ---

  if ("auth" in obj && typeof obj.auth === "object" && obj.auth !== null) {
    const authObj = obj.auth as Record<string, unknown>
    auth = {}

    if ("type" in authObj && typeof authObj.type === "string" && VALID_AUTH_TYPES.includes(authObj.type as AuthType)) {
      auth.authType = authObj.type as AuthType
      entries.push({
        field: "authType",
        label: t("setup.field.authType"),
        value: t(`auth.${authObj.type as AuthType}`),
        category: "auth"
      })
    }

    if ("username" in authObj && typeof authObj.username === "string" && authObj.username.length > 0) {
      auth.username = authObj.username
      entries.push({ field: "username", label: t("setup.field.username"), value: authObj.username, category: "auth" })
    }

    if ("password" in authObj && typeof authObj.password === "string" && authObj.password.length > 0) {
      auth.password = authObj.password
      entries.push({ field: "password", label: t("setup.field.password"), value: "•".repeat(8), category: "auth" })
    }

    if ("bearerToken" in authObj && typeof authObj.bearerToken === "string" && authObj.bearerToken.length > 0) {
      auth.bearerToken = authObj.bearerToken
      const masked =
        authObj.bearerToken.length > 8
          ? authObj.bearerToken.slice(0, 4) + "•".repeat(4) + authObj.bearerToken.slice(-4)
          : "•".repeat(authObj.bearerToken.length)
      entries.push({ field: "bearerToken", label: t("setup.field.bearerToken"), value: masked, category: "auth" })
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
      entries.push({
        field: "customHeaders",
        label: t("setup.field.customHeaders"),
        value: t("setup.headers", { count: Object.keys(validHeaders).length, n: Object.keys(validHeaders).length }),
        category: "auth"
      })
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
      entries.push({ field: "geofence", label: g.name, value: formatShortDistance(g.radius), category: "geofence" })
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
      entries.push({ field: "profile", label: p.name, value: formatDuration(p.interval), category: "profile" })
    }
  }

  if (entries.length === 0) {
    return {
      valid: false,
      config: { settings, auth, geofences, profiles },
      entries,
      error: t("setup.err.none")
    }
  }

  return { valid: true, config: { settings, auth, geofences, profiles }, entries }
}
