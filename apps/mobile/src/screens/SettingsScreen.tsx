/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, Switch, View, ScrollView, Pressable } from "react-native"
import { ScreenProps, Settings } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useAutoSave } from "../hooks/useAutoSave"
import { STATS_REFRESH_FAST, STATS_REFRESH_IDLE } from "../constants"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { FloatingSaveIndicator } from "../components/ui/FloatingSaveIndicator"
import { fonts } from "../styles/typography"
import { SectionTitle, Card, Container, Divider, SettingRow } from "../components"
import { ChevronRight } from "lucide-react-native"
import { StatsCard } from "../components"
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
          onManageClick={() => navigation.navigate("Data Management")}
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
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? colors.primary + "15" : colors.background,
                          borderColor: selected ? colors.primary : colors.border
                        }
                      ]}
                      onPress={() => selectTimeFormat(fmt)}
                    >
                      <Text style={[styles.chipLabel, { color: selected ? colors.primary : colors.text }]}>
                        {fmt === "24h" ? "24h" : "12h"}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </SettingRow>
          </Card>
        </View>

        {/* Advanced */}
        <View style={styles.section}>
          <SectionTitle>Advanced</SectionTitle>
          <Card>
            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
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
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
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
                  style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
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
  }
})
