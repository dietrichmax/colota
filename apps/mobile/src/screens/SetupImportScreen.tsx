/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useMemo } from "react"
import { View, Text, ScrollView, StyleSheet, Switch } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { Container, Card, Button, SectionTitle } from "../components"
import { fonts } from "../styles/typography"
import { CircleAlert, CircleCheck, Import } from "lucide-react-native"
import SettingsService from "../services/SettingsService"
import { OVERLAND_BATCH_MIN, OVERLAND_BATCH_MAX } from "../constants"
import { isEndpointAllowed } from "../utils/settingsValidation"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import {
  TRACKING_PRESETS,
  type Settings,
  type AuthConfig,
  type AuthType,
  type FieldMap,
  type CustomField,
  type ApiTemplateName,
  type HttpMethod,
  type DawarichMode,
  type SelectablePreset,
  type SyncPreset,
  type Geofence
} from "../types/global"

type ImportGeofence = Omit<Geofence, "id" | "createdAt">

// ============================================================================
// TYPES
// ============================================================================

interface ParsedConfig {
  settings: Partial<Settings>
  auth: Partial<AuthConfig> | null
  geofences: ImportGeofence[]
}

interface ConfigEntry {
  label: string
  value: string
  category: "tracking" | "api" | "auth" | "geofence"
  rejected?: boolean
}

interface ValidationResult {
  valid: boolean
  config: ParsedConfig
  entries: ConfigEntry[]
  error?: string
}

// ============================================================================
// VALIDATION
// ============================================================================

const VALID_API_TEMPLATES: ApiTemplateName[] = [
  "custom",
  "dawarich",
  "geopulse",
  "overland",
  "owntracks",
  "phonetrack",
  "reitti",
  "traccar"
]
const VALID_HTTP_METHODS: HttpMethod[] = ["POST", "GET"]
const VALID_DAWARICH_MODES: DawarichMode[] = ["single", "batch"]
const VALID_AUTH_TYPES: AuthType[] = ["none", "basic", "bearer"]

function detectPreset(settings: Partial<Settings>): SyncPreset {
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

function validateConfig(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      config: { settings: {}, auth: null, geofences: [] },
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
      entries.push({ label: "Password", value: "\u2022".repeat(8), category: "auth" })
    }

    if ("bearerToken" in authObj && typeof authObj.bearerToken === "string" && authObj.bearerToken.length > 0) {
      auth.bearerToken = authObj.bearerToken
      const masked =
        authObj.bearerToken.length > 8
          ? authObj.bearerToken.slice(0, 4) + "\u2022".repeat(4) + authObj.bearerToken.slice(-4)
          : "\u2022".repeat(authObj.bearerToken.length)
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

  if (entries.length === 0) {
    return {
      valid: false,
      config: { settings, auth, geofences },
      entries,
      error: "No valid settings found in configuration"
    }
  }

  return { valid: true, config: { settings, auth, geofences }, entries }
}

// ============================================================================
// SCREEN
// ============================================================================

export function SetupImportScreen({ route, navigation }: any) {
  const { colors } = useTheme()
  const { settings: currentSettings, setSettings } = useTracking()
  const [applying, setApplying] = useState(false)
  const [replaceByName, setReplaceByName] = useState(false)

  const result = useMemo(() => {
    try {
      const configParam = route.params?.config
      if (!configParam || typeof configParam !== "string") {
        return {
          valid: false,
          config: { settings: {}, auth: null, geofences: [] },
          entries: [],
          error: "No configuration data in URL"
        } as ValidationResult
      }

      const decoded = atob(configParam)
      const parsed = JSON.parse(decoded)
      return validateConfig(parsed)
    } catch (e) {
      logger.error("[SetupImport] Failed to parse config:", e)
      return {
        valid: false,
        config: { settings: {}, auth: null, geofences: [] },
        entries: [],
        error: "Invalid configuration data. The URL may be malformed."
      } as ValidationResult
    }
  }, [route.params?.config])

  const trackingEntries = result.entries.filter((e) => e.category === "tracking")
  const apiEntries = result.entries.filter((e) => e.category === "api")
  const authEntries = result.entries.filter((e) => e.category === "auth")
  const geofenceEntries = result.entries.filter((e) => e.category === "geofence")

  const handleApply = async () => {
    setApplying(true)
    try {
      // Deep merge nested objects (fieldMap, customFields) instead of replacing them
      const incoming = result.config.settings
      const merged: Settings = { ...currentSettings, ...incoming, hasCompletedSetup: true }
      if (incoming.fieldMap) {
        merged.fieldMap = { ...currentSettings.fieldMap, ...incoming.fieldMap }
      }
      merged.syncPreset = detectPreset(merged)

      await SettingsService.updateMultiple(merged)
      await setSettings(merged)

      // Apply auth - deep merge customHeaders
      if (result.config.auth) {
        const currentAuth = await NativeLocationService.getAuthConfig()
        const mergedAuth = { ...currentAuth, ...result.config.auth }
        if (result.config.auth.customHeaders) {
          mergedAuth.customHeaders = { ...currentAuth.customHeaders, ...result.config.auth.customHeaders }
        }
        await NativeLocationService.saveAuthConfig(mergedAuth)
      }

      // Apply geofences. Default is append-only (may create duplicates by name).
      // When replaceByName is on, existing zones with matching names are deleted first.
      if (result.config.geofences.length > 0) {
        const existingByName = replaceByName
          ? new Map(
              (await NativeLocationService.getGeofences())
                .filter((g) => typeof g.id === "number")
                .map((g) => [g.name, g.id as number])
            )
          : null
        for (const g of result.config.geofences) {
          if (existingByName) {
            const existingId = existingByName.get(g.name)
            if (existingId !== undefined) {
              await NativeLocationService.deleteGeofence(existingId)
            }
          }
          await NativeLocationService.createGeofence(g)
        }
      }

      showAlert("Configuration Applied", "Settings have been updated successfully.", "success")
      navigation.navigate("Dashboard")
    } catch (e) {
      logger.error("[SetupImport] Failed to apply config:", e)
      showAlert("Error", "Failed to apply configuration. Please try again.", "error")
    } finally {
      setApplying(false)
    }
  }

  const renderSection = (title: string, entries: ConfigEntry[]) => {
    if (entries.length === 0) return null
    return (
      <View style={styles.section}>
        <SectionTitle>{title}</SectionTitle>
        <Card>
          {entries.map((entry, i) => (
            <View
              key={entry.label}
              style={[
                styles.settingRow,
                i < entries.length - 1 && styles.settingRowBorder,
                i < entries.length - 1 && { borderBottomColor: colors.border }
              ]}
            >
              <Text style={[styles.settingLabel, { color: entry.rejected ? colors.error : colors.textSecondary }]}>
                {entry.label}
              </Text>
              <Text
                style={[styles.settingValue, { color: entry.rejected ? colors.error : colors.text }]}
                numberOfLines={1}
              >
                {entry.value}
              </Text>
            </View>
          ))}
        </Card>
      </View>
    )
  }

  const handleCancel = () => {
    navigation.navigate("Dashboard")
  }

  // --- Error state ---
  if (!result.valid) {
    return (
      <Container>
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.headerCard}>
            <View style={styles.headerRow}>
              <CircleAlert size={28} color={colors.error} />
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]}>Invalid Configuration</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{result.error}</Text>
              </View>
            </View>
          </Card>
          <Button title="Go Back" onPress={handleCancel} variant="primary" />
        </ScrollView>
      </Container>
    )
  }

  // --- Confirmation state ---
  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Import size={28} color={colors.primary} />
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Import Configuration</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                A setup link wants to apply {result.entries.length} setting{result.entries.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </Card>

        {renderSection("TRACKING", trackingEntries)}
        {renderSection("API", apiEntries)}
        {renderSection("AUTHENTICATION", authEntries)}
        {renderSection("GEOFENCES", geofenceEntries)}

        {geofenceEntries.length > 0 && (
          <View style={styles.section}>
            <Card>
              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>Replace zones with the same name</Text>
                  <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>
                    Off: imports are added as new entries
                  </Text>
                </View>
                <Switch testID="replace-geofences-switch" value={replaceByName} onValueChange={setReplaceByName} />
              </View>
            </Card>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title="Apply Configuration"
            onPress={handleApply}
            variant="primary"
            icon={CircleCheck}
            loading={applying}
            disabled={applying}
          />
          <Button title="Cancel" onPress={handleCancel} variant="ghost" />
        </View>
      </ScrollView>
    </Container>
  )
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40
  },
  headerCard: {
    marginBottom: 16
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  headerText: {
    flex: 1
  },
  title: {
    fontSize: 18,
    ...fonts.bold
  },
  subtitle: {
    fontSize: 13,
    ...fonts.regular,
    marginTop: 2
  },
  section: {
    marginTop: 8
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10
  },
  settingRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  settingLabel: {
    fontSize: 13,
    ...fonts.semiBold
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 12
  },
  toggleText: {
    flex: 1
  },
  toggleLabel: {
    fontSize: 13,
    ...fonts.semiBold
  },
  toggleHint: {
    fontSize: 12,
    ...fonts.regular,
    marginTop: 2
  },
  settingValue: {
    fontSize: 13,
    ...fonts.regular,
    maxWidth: "60%",
    textAlign: "right"
  },
  actions: {
    marginTop: 24
  }
})
