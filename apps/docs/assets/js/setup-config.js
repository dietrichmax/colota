/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

// The link generator's form state to a colota://setup config. No imports, so scripts/setup-config.test.mjs runs it in Node.

// bluetooth_device is left out: it needs the paired device's MAC address, which only the app knows.
export const PROFILE_CONDITION_LABELS = {
  charging: "Charging",
  android_auto: "Android Auto / Car mode",
  wifi_any: "Wi-Fi",
  wifi_ssid: "Wi-Fi network",
  speed_above: "Speed above threshold",
  speed_below: "Speed below threshold",
  stationary: "Stationary"
}

export const ACCURACY_MODE_LABELS = {
  high: "High accuracy",
  balanced: "Lower accuracy"
}

// chosen to keep the QR below v25 at ECC L
export const QR_MAX_SCANNABLE_LENGTH = 1200

export const newGeofence = () => ({
  name: "",
  lat: "",
  lon: "",
  radius: "",
  pauseTracking: true,
  pauseOnWifi: false,
  pauseOnMotionless: false,
  motionlessTimeoutMinutes: "",
  heartbeatEnabled: false,
  heartbeatIntervalMinutes: ""
})

export const newProfile = () => ({
  name: "",
  conditionType: "charging",
  speedKmh: "",
  ssid: "",
  interval: "5",
  distance: "0",
  syncInterval: "0",
  priority: "10",
  activationDelay: "0",
  deactivationDelay: "60",
  accuracyThreshold: "",
  enabled: true
})

export function buildConfig(s) {
  const obj = {}

  if (s.endpoint) obj.endpoint = s.endpoint
  if (s.apiTemplate) obj.apiTemplate = s.apiTemplate
  if (s.httpMethod) obj.httpMethod = s.httpMethod
  if (s.dawarichMode) obj.dawarichMode = s.dawarichMode
  if (s.overlandBatchSize && Number(s.overlandBatchSize) > 0) obj.overlandBatchSize = Number(s.overlandBatchSize)
  if (s.sendInRegions) obj.sendInRegions = s.sendInRegions === "true"
  if (s.sendTransitions) obj.sendTransitions = s.sendTransitions === "true"

  if (s.interval) obj.interval = Number(s.interval)
  if (s.distance) obj.distance = Number(s.distance)
  if (s.accuracyThreshold) obj.accuracyThreshold = Number(s.accuracyThreshold)
  if (s.filterInaccurateLocations) obj.filterInaccurateLocations = s.filterInaccurateLocations === "true"
  if (s.accuracyMode) obj.accuracyMode = s.accuracyMode

  if (s.syncInterval) obj.syncInterval = Number(s.syncInterval)
  if (s.isOfflineMode) obj.isOfflineMode = s.isOfflineMode === "true"
  if (s.syncCondition) obj.syncCondition = s.syncCondition
  if (s.syncSsid) obj.syncSsid = s.syncSsid

  if (s.authType && s.authType !== "none") {
    const auth = { type: s.authType }
    if (s.authType === "basic") {
      if (s.authUsername) auth.username = s.authUsername
      if (s.authPassword) auth.password = s.authPassword
    } else if (s.authType === "bearer") {
      if (s.authBearerToken) auth.bearerToken = s.authBearerToken
    }
    obj.auth = auth
  } else if (s.authType === "none") {
    obj.auth = { type: "none" }
  }

  const fm = {}
  for (const e of s.fieldMapEntries) {
    if (e.key && e.value) fm[e.key] = e.value
  }
  if (Object.keys(fm).length > 0) obj.fieldMap = fm

  const cf = s.customFields.filter((e) => e.key && e.value)
  if (cf.length > 0) obj.customFields = cf

  const ch = {}
  for (const e of s.customHeaders) {
    if (e.key && e.value) ch[e.key] = e.value
  }
  if (Object.keys(ch).length > 0) obj.customHeaders = ch

  const gfs = s.geofences
    .filter((g) => g.name && g.lat && g.lon && g.radius && Number(g.radius) > 0)
    .map((g) => {
      const entry = {
        name: g.name,
        lat: Number(g.lat),
        lon: Number(g.lon),
        radius: Number(g.radius)
      }
      if (g.pauseTracking) entry.pauseTracking = true
      if (g.pauseOnWifi) entry.pauseOnWifi = true
      if (g.pauseOnMotionless) {
        entry.pauseOnMotionless = true
        if (g.motionlessTimeoutMinutes && Number(g.motionlessTimeoutMinutes) > 0) {
          entry.motionlessTimeoutMinutes = Number(g.motionlessTimeoutMinutes)
        }
      }
      if (g.heartbeatEnabled) {
        entry.heartbeatEnabled = true
        if (g.heartbeatIntervalMinutes && Number(g.heartbeatIntervalMinutes) > 0) {
          entry.heartbeatIntervalMinutes = Number(g.heartbeatIntervalMinutes)
        }
      }
      return entry
    })
  if (gfs.length > 0) obj.geofences = gfs

  const pfs = []
  for (const p of s.profiles) {
    if (!p.name) continue
    if (!p.interval || Number(p.interval) <= 0) continue
    if (p.distance === "" || Number(p.distance) < 0) continue
    if (p.syncInterval === "" || Number(p.syncInterval) < 0) continue

    const isSpeed = p.conditionType === "speed_above" || p.conditionType === "speed_below"
    const condition = { type: p.conditionType }
    if (isSpeed) {
      if (!p.speedKmh || Number(p.speedKmh) <= 0) continue
      condition.speedThreshold = Number(p.speedKmh) / 3.6
    }
    if (p.conditionType === "wifi_ssid") {
      const ssid = p.ssid.trim()
      if (!ssid) continue
      condition.ssid = ssid
    }

    const entry = {
      name: p.name,
      condition,
      interval: Number(p.interval),
      distance: Number(p.distance),
      syncInterval: Number(p.syncInterval),
      priority: p.priority ? Number(p.priority) : 10,
      enabled: p.enabled
    }
    // Stationary hides the delay inputs; omit them so the app applies its own defaults (60 / 0)
    if (p.conditionType !== "stationary") {
      entry.activationDelay = p.activationDelay ? Number(p.activationDelay) : 0
      entry.deactivationDelay = p.deactivationDelay ? Number(p.deactivationDelay) : 60
    }
    if (Number(p.accuracyThreshold) > 0) entry.accuracyThreshold = Number(p.accuracyThreshold)
    pfs.push(entry)
  }
  if (pfs.length > 0) obj.profiles = pfs

  return obj
}
