/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { Settings, AuthConfig, Geofence, TrackingProfile } from "../types/global"

/** Which config categories to include in a shared setup link. */
export interface SetupShareSelection {
  tracking: boolean
  sync: boolean
  api: boolean
  credentials: boolean
  geofences: boolean
  profiles: boolean
}

/** Live config read from the running app, used to build a setup link. */
export interface SetupShareParts {
  settings: Settings
  auth: AuthConfig
  geofences: Geofence[]
  profiles: TrackingProfile[]
}

/**
 * Builds the config object the importer's `validateConfig` accepts, including only the selected
 * categories. The standalone Geofences/Profiles share buttons reuse this too.
 */
export function buildSetupConfig(parts: SetupShareParts, sel: SetupShareSelection): Record<string, unknown> {
  const { settings, auth, geofences, profiles } = parts
  const config: Record<string, unknown> = {}

  if (sel.tracking) {
    config.interval = settings.interval
    config.distance = settings.distance
    config.accuracyThreshold = settings.accuracyThreshold
    config.filterInaccurateLocations = settings.filterInaccurateLocations
  }

  if (sel.sync) {
    config.syncInterval = settings.syncInterval
    config.retryInterval = settings.retryInterval
    config.isOfflineMode = settings.isOfflineMode
    config.syncCondition = settings.syncCondition
    if (settings.syncSsid) config.syncSsid = settings.syncSsid
  }

  if (sel.api) {
    if (settings.endpoint) config.endpoint = settings.endpoint
    config.apiTemplate = settings.apiTemplate
    config.httpMethod = settings.httpMethod
    config.dawarichMode = settings.dawarichMode
    config.overlandBatchSize = settings.overlandBatchSize
    if (settings.fieldMap && Object.keys(settings.fieldMap).length > 0) config.fieldMap = settings.fieldMap
    if (settings.customFields && settings.customFields.length > 0) config.customFields = settings.customFields
  }

  // Importer expects `auth.type` (not `authType`) and top-level `customHeaders`.
  if (sel.credentials) {
    const a: Record<string, unknown> = { type: auth.authType }
    if (auth.authType === "basic") {
      if (auth.username) a.username = auth.username
      if (auth.password) a.password = auth.password
    } else if (auth.authType === "bearer") {
      if (auth.bearerToken) a.bearerToken = auth.bearerToken
    }
    config.auth = a
    if (auth.customHeaders && Object.keys(auth.customHeaders).length > 0) {
      config.customHeaders = auth.customHeaders
    }
  }

  if (sel.geofences && geofences.length > 0) {
    config.geofences = geofences.map(stripGeofence)
  }

  if (sel.profiles && profiles.length > 0) {
    config.profiles = profiles.map(stripProfile)
  }

  return config
}

/** Builds the full `colota://setup?config=...` deep link for the selected categories. */
export function buildSetupLink(parts: SetupShareParts, sel: SetupShareSelection): string {
  return encode(buildSetupConfig(parts, sel))
}

/** Single-category link for the standalone Geofences share button. */
export function buildGeofencesLink(geofences: Geofence[]): string {
  return encode({ geofences: geofences.map(stripGeofence) })
}

/** Single-category link for the standalone Tracking Profiles share button. */
export function buildProfilesLink(profiles: TrackingProfile[]): string {
  return encode({ profiles: profiles.map(stripProfile) })
}

// Strip DB-only fields (id/createdAt, plus enabled for geofences - the importer defaults it to true).
function stripGeofence({ id: _id, createdAt: _createdAt, enabled: _enabled, ...rest }: Geofence) {
  return rest
}

function stripProfile({ id: _id, createdAt: _createdAt, ...rest }: TrackingProfile) {
  return rest
}

function encode(config: Record<string, unknown>): string {
  return `colota://setup?config=${encodeConfig(config)}`
}

export function encodeConfig(config: unknown): string {
  return btoa(JSON.stringify(config))
}

/**
 * Decodes a setup-link `config` param. React Navigation's query parser decodes `+` as a space, and
 * base64 never contains spaces, so any space here was a `+` - restore it before decoding.
 */
export function decodeConfig(param: string): unknown {
  return JSON.parse(atob(param.replace(/ /g, "+")))
}
