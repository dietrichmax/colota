/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useMemo } from "react"
import { View, Text, ScrollView, StyleSheet, DeviceEventEmitter } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import {
  Button,
  Card,
  Container,
  Divider,
  EmptyState,
  FieldMessage,
  SectionTitle,
  SettingRow,
  StatRow,
  Toggle
} from "../components"
import { fontSizes, fonts, lineHeights, type } from "../styles/typography"
import { Check, CircleAlert } from "lucide-react-native"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import { type Settings } from "../types/global"
import {
  validateConfig,
  detectPreset,
  setupEndpointHost,
  type ConfigEntry,
  type ValidationResult
} from "../utils/setupConfig"
import { decodeConfig } from "../utils/setupLink"
import { space } from "../constants"

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
          config: { settings: {}, auth: null, geofences: [], profiles: [] },
          entries: [],
          error: "No configuration data in URL"
        } as ValidationResult
      }

      return validateConfig(decodeConfig(configParam))
    } catch (e) {
      logger.error("[SetupImport] Failed to parse config:", e)
      return {
        valid: false,
        config: { settings: {}, auth: null, geofences: [], profiles: [] },
        entries: [],
        error: "Invalid configuration data. The URL may be malformed."
      } as ValidationResult
    }
  }, [route.params?.config])

  const trackingEntries = result.entries.filter((e) => e.category === "tracking")
  const apiEntries = result.entries.filter((e) => e.category === "api")
  const authEntries = result.entries.filter((e) => e.category === "auth")
  const geofenceEntries = result.entries.filter((e) => e.category === "geofence")
  const profileEntries = result.entries.filter((e) => e.category === "profile")

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
        DeviceEventEmitter.emit("geofenceUpdated")
      }

      if (result.config.profiles.length > 0) {
        const existingProfilesByName = replaceByName
          ? new Map((await NativeLocationService.getProfiles()).map((p) => [p.name, p.id]))
          : null
        for (const p of result.config.profiles) {
          if (existingProfilesByName) {
            const existingId = existingProfilesByName.get(p.name)
            if (existingId !== undefined) {
              await NativeLocationService.deleteProfile(existingId)
            }
          }
          await NativeLocationService.createProfile(p)
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

  // The endpoint decides where every location goes, so it is never cut to one line like a StatRow value.
  const renderEndpoint = (entry: ConfigEntry) => {
    const current = currentSettings.endpoint
    const currentHost = current && current !== entry.value ? (setupEndpointHost(current) ?? current) : null
    return (
      <View style={styles.endpoint}>
        <Text style={[styles.endpointLabel, { color: colors.textSecondary }]}>Sends locations to</Text>
        <Text style={[styles.endpointHost, { color: colors.text }]}>{setupEndpointHost(entry.value)}</Text>
        <Text style={[type.mono, { color: colors.textSecondary }]}>{entry.value}</Text>
        {currentHost && <FieldMessage variant="warning">Replaces your current server, {currentHost}</FieldMessage>}
      </View>
    )
  }

  const renderSection = (title: string, entries: ConfigEntry[]) => {
    if (entries.length === 0) return null
    return (
      <View style={styles.section}>
        <SectionTitle>{title}</SectionTitle>
        <Card>
          {entries.map((entry, i) => (
            <React.Fragment key={entry.label}>
              {i > 0 && <Divider tight />}
              {entry.label === "Endpoint" ? renderEndpoint(entry) : <StatRow label={entry.label} value={entry.value} />}
            </React.Fragment>
          ))}
        </Card>
      </View>
    )
  }

  const replaceLabel =
    geofenceEntries.length > 0 && profileEntries.length > 0
      ? "Replace zones and profiles with the same name"
      : profileEntries.length > 0
        ? "Replace profiles with the same name"
        : "Replace zones with the same name"

  const handleCancel = () => {
    navigation.navigate("Dashboard")
  }

  // --- Error state ---
  if (!result.valid) {
    return (
      <Container>
        <ScrollView contentContainerStyle={styles.content}>
          <EmptyState icon={CircleAlert} title="Invalid configuration" hint={result.error} />
          <Button title="Go back" onPress={handleCancel} variant="primary" />
        </ScrollView>
      </Container>
    )
  }

  // --- Confirmation state ---
  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          A setup link wants to apply {result.entries.length} setting{result.entries.length !== 1 ? "s" : ""}. Apply it
          only if you trust where it came from.
        </Text>

        {renderSection("Tracking", trackingEntries)}
        {renderSection("API", apiEntries)}
        {renderSection("Authentication", authEntries)}
        {renderSection("Geofences", geofenceEntries)}
        {renderSection("Tracking profiles", profileEntries)}

        {(geofenceEntries.length > 0 || profileEntries.length > 0) && (
          <View style={styles.section}>
            <Card rows>
              <SettingRow label={replaceLabel} hint="Off: imports are added as new entries">
                <Toggle
                  accessibilityLabel={replaceLabel}
                  testID="replace-imports-switch"
                  value={replaceByName}
                  onValueChange={setReplaceByName}
                />
              </SettingRow>
            </Card>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title="Apply configuration"
            onPress={handleApply}
            variant="primary"
            icon={Check}
            loading={applying}
            disabled={applying}
          />
          <Button title="Cancel" onPress={handleCancel} variant="ghost" />
        </View>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  subtitle: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  section: {
    marginTop: space.xl
  },
  endpoint: {
    paddingVertical: space.sm,
    gap: space.xxs
  },
  endpointLabel: {
    fontSize: fontSizes.body,
    ...fonts.regular
  },
  endpointHost: {
    fontSize: fontSizes.body,
    ...fonts.semiBold,
    lineHeight: lineHeights.body
  },
  actions: {
    marginTop: space.xl
  }
})
