/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

// ============================================================================
// NAVIGATION & UI
// ============================================================================

export interface ScreenProps {
  navigation: any
}

export type { ThemeColors, ThemeMode } from "@colota/shared"

// ============================================================================
// LOCATION DATA
// ============================================================================

export interface LocationCoords {
  latitude: number
  longitude: number
  altitude?: number
  accuracy?: number
  speed?: number
  bearing?: number
  battery?: number
  battery_status?: number
  timestamp?: number
}

export interface Geofence {
  id?: number
  name: string
  lat: number
  lon: number
  radius: number
  enabled: boolean
  pauseTracking: boolean
  createdAt?: number
}

/**
 * Result interface for location tracking hook
 */
export interface LocationTrackingResult {
  coords: LocationCoords | null
  tracking: boolean
  startTracking: (overrideSettings?: Settings) => Promise<void>
  stopTracking: () => void
  restartTracking: (newSettings?: Settings) => Promise<void>
  reconnect: () => Promise<void>
  settings: Settings
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

export type ServerStatus = "connected" | "error" | "notConfigured"

export interface ServerConnectionProps {
  endpoint: string | null
  navigation: any
}

export interface FieldMap {
  lat: string
  lon: string
  acc: string
  alt?: string
  vel?: string
  batt?: string
  bs?: string
  tst?: string
  bear?: string
}

export const DEFAULT_FIELD_MAP: FieldMap = {
  lat: "lat",
  lon: "lon",
  acc: "acc",
  alt: "alt",
  vel: "vel",
  batt: "batt",
  bs: "bs",
  tst: "tst",
  bear: "bear"
} as const

export interface CustomField {
  key: string
  value: string
}

export type HttpMethod = "POST" | "GET"

export type ApiTemplateName = "custom" | "dawarich" | "owntracks" | "phonetrack" | "reitti" | "traccar"

export interface ApiTemplate {
  name: ApiTemplateName
  label: string
  description: string
  fieldMap: FieldMap
  customFields: CustomField[]
  httpMethod?: HttpMethod
}

export const API_TEMPLATES: Record<Exclude<ApiTemplateName, "custom">, ApiTemplate> = {
  dawarich: {
    name: "dawarich",
    label: "Dawarich",
    description: "OwnTracks-compatible format for Dawarich",
    fieldMap: {
      lat: "lat",
      lon: "lon",
      acc: "acc",
      alt: "alt",
      vel: "vel",
      batt: "batt",
      bs: "bs",
      tst: "tst",
      bear: "cog"
    },
    customFields: [{ key: "_type", value: "location" }]
  },
  owntracks: {
    name: "owntracks",
    label: "OwnTracks",
    description: "Standard OwnTracks HTTP format",
    fieldMap: {
      lat: "lat",
      lon: "lon",
      acc: "acc",
      alt: "alt",
      vel: "vel",
      batt: "batt",
      bs: "bs",
      tst: "tst",
      bear: "cog"
    },
    customFields: [
      { key: "_type", value: "location" },
      { key: "tid", value: "AA" }
    ]
  },
  phonetrack: {
    name: "phonetrack",
    label: "Nextcloud PhoneTrack",
    description: "Nextcloud PhoneTrack logging format",
    fieldMap: {
      lat: "lat",
      lon: "lon",
      acc: "acc",
      alt: "alt",
      vel: "speed",
      batt: "bat",
      bs: "bs",
      tst: "timestamp",
      bear: "bearing"
    },
    customFields: [{ key: "useragent", value: "Colota" }]
  },
  reitti: {
    name: "reitti",
    label: "Reitti",
    description: "OwnTracks-compatible format for Reitti",
    fieldMap: {
      lat: "lat",
      lon: "lon",
      acc: "acc",
      alt: "alt",
      vel: "vel",
      batt: "batt",
      bs: "bs",
      tst: "tst",
      bear: "bear"
    },
    customFields: [{ key: "_type", value: "location" }]
  },
  traccar: {
    name: "traccar",
    label: "Traccar",
    description: "Traccar OsmAnd protocol (HTTP GET)",
    httpMethod: "GET",
    fieldMap: {
      lat: "lat",
      lon: "lon",
      acc: "accuracy",
      alt: "altitude",
      vel: "speed",
      batt: "batt",
      bs: "charge",
      tst: "timestamp",
      bear: "bearing"
    },
    customFields: [{ key: "id", value: "colota" }]
  }
}

// ============================================================================
// PRESETS
// ============================================================================

export type BatteryImpact = "Low" | "Medium" | "High"

export interface TrackingPresetConfig {
  interval: number
  distance: number
  syncInterval: number
  retryInterval: number
  label: string
  description: string
  batteryImpact: BatteryImpact
}

export const TRACKING_PRESETS = {
  instant: {
    interval: 5,
    distance: 0,
    syncInterval: 0,
    retryInterval: 30,
    label: "Instant",
    description: "Track every 5s • Send instantly",
    batteryImpact: "High"
  },
  balanced: {
    interval: 30,
    distance: 2,
    syncInterval: 300,
    retryInterval: 300,
    label: "Balanced",
    description: "Track every 30s • Batch 5 min",
    batteryImpact: "Medium"
  },
  powersaver: {
    interval: 60,
    distance: 2,
    syncInterval: 900,
    retryInterval: 900,
    label: "Power Saver",
    description: "Track every 60s • Batch 15 min",
    batteryImpact: "Low"
  }
} as const satisfies Record<string, TrackingPresetConfig>

export type SelectablePreset = keyof typeof TRACKING_PRESETS
export type SyncPreset = SelectablePreset | "custom"

// ============================================================================
// SETTINGS
// ============================================================================

export interface Settings {
  // Tracking (GPS)
  interval: number
  distance: number
  filterInaccurateLocations: boolean
  accuracyThreshold: number

  // Endpoint & Mapping
  endpoint: string
  fieldMap: FieldMap
  customFields: CustomField[]
  apiTemplate: ApiTemplateName
  httpMethod: HttpMethod

  // Sync & Upload
  syncInterval: number
  retryInterval: number
  maxRetries: number
  isOfflineMode: boolean

  // UI State
  syncPreset: SyncPreset
  hasCompletedSetup: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  interval: TRACKING_PRESETS.instant.interval,
  distance: TRACKING_PRESETS.instant.distance,
  endpoint: "",
  fieldMap: DEFAULT_FIELD_MAP,
  customFields: [],
  apiTemplate: "custom",
  syncInterval: TRACKING_PRESETS.instant.syncInterval,
  retryInterval: TRACKING_PRESETS.instant.retryInterval,
  filterInaccurateLocations: false,
  accuracyThreshold: 50,
  syncPreset: "instant",
  maxRetries: 5,
  isOfflineMode: false,
  hasCompletedSetup: false,
  httpMethod: "POST"
} as const

// ============================================================================
// AUTHENTICATION
// ============================================================================

export type AuthType = "none" | "basic" | "bearer"

export interface AuthConfig {
  authType: AuthType
  username: string
  password: string
  bearerToken: string
  customHeaders: Record<string, string>
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  authType: "none",
  username: "",
  password: "",
  bearerToken: "",
  customHeaders: {}
}

// ============================================================================
// DATABASE
// ============================================================================

export interface DatabaseStats {
  queued: number
  sent: number
  total: number
  today: number
  databaseSizeMB: number
}
