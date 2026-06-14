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
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import { type Settings } from "../types/global"
import { validateConfig, detectPreset, type ConfigEntry, type ValidationResult } from "../utils/setupConfig"
import { decodeConfig } from "../utils/setupLink"

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
        {renderSection("TRACKING PROFILES", profileEntries)}

        {(geofenceEntries.length > 0 || profileEntries.length > 0) && (
          <View style={styles.section}>
            <Card>
              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>
                    {geofenceEntries.length > 0 && profileEntries.length > 0
                      ? "Replace zones and profiles with the same name"
                      : profileEntries.length > 0
                        ? "Replace profiles with the same name"
                        : "Replace zones with the same name"}
                  </Text>
                  <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>
                    Off: imports are added as new entries
                  </Text>
                </View>
                <Switch testID="replace-imports-switch" value={replaceByName} onValueChange={setReplaceByName} />
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
