/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, Switch, View, ScrollView, Pressable, TextInput } from "react-native"
import { ScreenProps, Settings } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useAutoSave } from "../hooks/useAutoSave"
import { STATS_REFRESH_FAST, STATS_REFRESH_IDLE } from "../constants"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { FloatingSaveIndicator } from "../components/ui/FloatingSaveIndicator"
import { fonts } from "../styles/typography"
import { SectionTitle, Card, Container, Divider, SettingRow, StatsCard } from "../components"
import { ChevronRight, ChevronDown, ChevronUp } from "lucide-react-native"
import { logger } from "../utils/logger"
import { ConnectionSettings } from "../components/features/settings/ConnectionSettings"
import { SyncStrategySettings } from "../components/features/settings/SyncStrategySettings"
import { loadDisplayPreferences, getUnitSystem, getTimeFormat } from "../utils/geo"
import type { UnitSystem, TimeFormat } from "../utils/geo"

/**
 * Settings screen for configuring location tracking.
 * Features auto-save, presets, and advanced customization.
 */
export function SettingsScreen({ navigation }: ScreenProps) {
  const { settings, setSettings, updateSettingsLocal, tracking, restartTracking } = useTracking()
  const { mode, toggleTheme, colors } = useTheme()
  const { saving, saveSuccess, debouncedSaveAndRestart, immediateSaveAndRestart } = useAutoSave()

  // Stats
  const [queueCount, setQueueCount] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [todayCount, setTodayCount] = useState(0)

  // Endpoint input (managed here since ConnectionSettings needs it and we sync with settings)
  const [endpointInput, setEndpointInput] = useState(settings.endpoint || "")

  // Display preferences (preselect from locale if not yet saved)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(getUnitSystem)
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(getTimeFormat)

  // Map style URLs
  const [mapStyleUrlLight, setMapStyleUrlLight] = useState("")
  const [mapStyleUrlDark, setMapStyleUrlDark] = useState("")
  const [showMapTileServer, setShowMapTileServer] = useState(false)

  const selectUnitSystem = useCallback(
    async (value: UnitSystem) => {
      const prev = unitSystem
      setUnitSystem(value)
      try {
        await NativeLocationService.saveSetting("unitSystem", value)
        await loadDisplayPreferences()
      } catch {
        setUnitSystem(prev)
      }
    },
    [unitSystem]
  )

  const selectTimeFormat = useCallback(
    async (value: TimeFormat) => {
      const prev = timeFormat
      setTimeFormat(value)
      try {
        await NativeLocationService.saveSetting("timeFormat", value)
        await loadDisplayPreferences()
      } catch {
        setTimeFormat(prev)
      }
    },
    [timeFormat]
  )

  // Load map style URLs from settings
  useEffect(() => {
    Promise.all([
      NativeLocationService.getSetting("mapStyleUrlLight"),
      NativeLocationService.getSetting("mapStyleUrlDark")
    ])
      .then(([light, dark]) => {
        setMapStyleUrlLight(light ?? "")
        setMapStyleUrlDark(dark ?? "")
      })
      .catch(() => {})
  }, [])

  const saveMapStyleUrl = useCallback(async (key: "mapStyleUrlLight" | "mapStyleUrlDark", value: string) => {
    try {
      await NativeLocationService.saveSetting(key, value.trim())
    } catch (err) {
      logger.error("[SettingsScreen] Failed to save map style URL:", err)
    }
  }, [])

  const resetMapStyle = useCallback(() => {
    setMapStyleUrlLight("")
    setMapStyleUrlDark("")
    Promise.all([
      NativeLocationService.saveSetting("mapStyleUrlLight", ""),
      NativeLocationService.saveSetting("mapStyleUrlDark", "")
    ]).catch((err) => logger.error("[SettingsScreen] Failed to reset map style URLs:", err))
  }, [])

  // Sync endpoint input with settings changes
  useEffect(() => {
    setEndpointInput(settings.endpoint || "")
  }, [settings.endpoint])

  /** Update stats */
  const updateStats = useCallback(async () => {
    try {
      const stats = await NativeLocationService.getStats()
      setQueueCount(stats.queued)
      setSentCount(stats.sent)
      setTodayCount(stats.today)
    } catch (err) {
      logger.error("[SettingsScreen] Failed to get stats:", err)
    }
  }, [])

  // Poll stats: 3s when tracking, 30s when idle
  useEffect(() => {
    updateStats()
    const interval = setInterval(updateStats, tracking ? STATS_REFRESH_FAST : STATS_REFRESH_IDLE)
    return () => clearInterval(interval)
  }, [updateStats, tracking])

  /** Debounced save + restart for continuous changes (text input, sliders) */
  const handleDebouncedSave = useCallback(
    (newSettings: Settings) => {
      debouncedSaveAndRestart(
        () => setSettings(newSettings),
        () => restartTracking(newSettings)
      )
    },
    [setSettings, debouncedSaveAndRestart, restartTracking]
  )

  /** Immediate save + restart for discrete changes (toggles, presets) */
  const handleImmediateSave = useCallback(
    (newSettings: Settings) => {
      immediateSaveAndRestart(
        () => setSettings(newSettings),
        () => restartTracking(newSettings)
      )
    },
    [setSettings, immediateSaveAndRestart, restartTracking]
  )

  const handleNavigateDataManagement = useCallback(() => {
    navigation.navigate("Data Management")
  }, [navigation])

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        </View>

        {/* Stats Card */}
        <StatsCard
          queueCount={queueCount}
          sentCount={sentCount}
          todayCount={todayCount}
          interval={settings.interval.toString()}
          onManageClick={handleNavigateDataManagement}
          colors={colors}
        />

        {/* Connection */}
        <ConnectionSettings
          settings={settings}
          endpointInput={endpointInput}
          onEndpointInputChange={setEndpointInput}
          onSettingsChange={handleImmediateSave}
          colors={colors}
          navigation={navigation}
        />

        {/* Tracking Configuration */}
        <SyncStrategySettings
          settings={settings}
          onSettingsChange={updateSettingsLocal}
          onDebouncedSave={handleDebouncedSave}
          onImmediateSave={handleImmediateSave}
          colors={colors}
        />

        {/* Appearance */}
        <View style={styles.section}>
          <SectionTitle>Appearance</SectionTitle>
          <Card>
            <SettingRow label="Dark Mode">
              <Switch
                testID="dark-mode-switch"
                value={mode === "dark"}
                onValueChange={toggleTheme}
                trackColor={{
                  false: colors.border,
                  true: colors.primary + "80"
                }}
                thumbColor={mode === "dark" ? colors.primary : colors.border}
              />
            </SettingRow>

            <Divider />

            <SettingRow label="Units">
              <View style={styles.chipGroup}>
                {(["metric", "imperial"] as const).map((unit) => {
                  const selected = unitSystem === unit
                  return (
                    <Pressable
                      key={unit}
                      testID={`unit-${unit}`}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? colors.primary + "15" : colors.background,
                          borderColor: selected ? colors.primary : colors.border
                        }
                      ]}
                      onPress={() => selectUnitSystem(unit)}
                    >
                      <Text style={[styles.chipLabel, { color: selected ? colors.primary : colors.text }]}>
                        {unit === "metric" ? "Metric" : "Imperial"}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </SettingRow>

            <Divider />

            <SettingRow label="Time Format">
              <View style={styles.chipGroup}>
                {(["24h", "12h"] as const).map((fmt) => {
                  const selected = timeFormat === fmt
                  return (
                    <Pressable
                      key={fmt}
                      testID={`time-format-${fmt}`}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? colors.primary + "15" : colors.background,
                          borderColor: selected ? colors.primary : colors.border
                        }
                      ]}
                      onPress={() => selectTimeFormat(fmt)}
                    >
                      <Text style={[styles.chipLabel, { color: selected ? colors.primary : colors.text }]}>{fmt}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </SettingRow>

            <Divider />

            <Pressable
              testID="map-tile-server-toggle"
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={() => setShowMapTileServer(!showMapTileServer)}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>Map Tile Server</Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                  Override the default map tile source
                </Text>
              </View>
              {showMapTileServer ? (
                <ChevronUp size={20} color={colors.textLight} />
              ) : (
                <ChevronDown size={20} color={colors.textLight} />
              )}
            </Pressable>

            {showMapTileServer && (
              <View style={styles.mapTilePanel}>
                <Text style={[styles.mapStyleSub, styles.mapStyleSubFirst, { color: colors.textSecondary }]}>
                  Light style URL
                </Text>
                <TextInput
                  testID="map-style-url-light"
                  style={[
                    styles.mapStyleInput,
                    { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }
                  ]}
                  value={mapStyleUrlLight}
                  onChangeText={setMapStyleUrlLight}
                  onBlur={() => saveMapStyleUrl("mapStyleUrlLight", mapStyleUrlLight)}
                  placeholder="Default"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={[styles.mapStyleSub, styles.mapStyleSubSecond, { color: colors.textSecondary }]}>
                  Dark style URL
                </Text>
                <TextInput
                  testID="map-style-url-dark"
                  style={[
                    styles.mapStyleInput,
                    { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }
                  ]}
                  value={mapStyleUrlDark}
                  onChangeText={setMapStyleUrlDark}
                  onBlur={() => saveMapStyleUrl("mapStyleUrlDark", mapStyleUrlDark)}
                  placeholder="Default"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <View style={styles.mapStyleFooter}>
                  <Text style={[styles.mapStyleHint, { color: colors.textLight }]}>Leave empty to use the default</Text>
                  {mapStyleUrlLight.trim() || mapStyleUrlDark.trim() ? (
                    <Pressable
                      onPress={resetMapStyle}
                      style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
                    >
                      <Text style={[styles.mapStyleHint, { color: colors.primary }]}>Reset to default</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )}
          </Card>
        </View>

        {/* Advanced */}
        <View style={styles.section}>
          <SectionTitle>Advanced</SectionTitle>
          <Card>
            <Pressable
              testID="nav-tracking-profiles"
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={() => navigation.navigate("Tracking Profiles")}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>Tracking Profiles</Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                  Auto-switch GPS settings based on conditions
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textLight} />
            </Pressable>

            <Divider />

            <Pressable
              testID="nav-offline-maps"
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={() => navigation.navigate("Offline Maps")}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>Offline Maps</Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                  Download map tiles for use without internet
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textLight} />
            </Pressable>

            <Divider />

            <Pressable
              testID="nav-data-management"
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={() => navigation.navigate("Data Management")}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>Data Management</Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>View queue and clear data</Text>
              </View>
              <ChevronRight size={20} color={colors.textLight} />
            </Pressable>

            {!settings.isOfflineMode && (
              <>
                <Divider />

                <Pressable
                  testID="nav-api-config"
                  style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
                  onPress={() => navigation.navigate("API Config")}
                >
                  <View style={styles.linkContent}>
                    <Text style={[styles.linkLabel, { color: colors.text }]}>API Field Mapping</Text>
                    <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                      Customize JSON payload structure
                    </Text>
                  </View>
                  <ChevronRight size={20} color={colors.textLight} />
                </Pressable>
              </>
            )}
          </Card>
        </View>
      </ScrollView>

      <FloatingSaveIndicator saving={saving} success={saveSuccess} colors={colors} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40
  },
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    letterSpacing: -0.5
  },
  section: {
    marginBottom: 24
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12
  },
  linkContent: {
    flex: 1
  },
  linkLabel: {
    fontSize: 16,
    ...fonts.semiBold,
    marginBottom: 2
  },
  linkSub: {
    fontSize: 13,
    ...fonts.regular
  },
  chipGroup: {
    flexDirection: "row",
    gap: 8
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5
  },
  chipLabel: {
    fontSize: 13,
    ...fonts.semiBold
  },
  mapTilePanel: {
    marginTop: 4,
    paddingBottom: 4
  },
  mapStyleSub: {
    fontSize: 12,
    ...fonts.medium,
    marginBottom: 6
  },
  mapStyleSubFirst: { marginTop: 12 },
  mapStyleSubSecond: { marginTop: 10 },
  mapStyleInput: {
    borderWidth: 1.5,
    padding: 12,
    borderRadius: 12,
    fontSize: 13,
    ...fonts.regular
  },
  mapStyleFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8
  },
  mapStyleHint: {
    fontSize: 11,
    ...fonts.regular
  }
})
