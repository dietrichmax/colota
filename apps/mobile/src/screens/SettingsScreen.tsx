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
import { SectionTitle, Card, Container, Divider } from "../components"
import { ChevronRight } from "lucide-react-native"
import { StatsCard } from "../components"
import { logger } from "../utils/logger"
import { ConnectionSettings } from "../components/features/settings/ConnectionSettings"
import { SyncStrategySettings } from "../components/features/settings/SyncStrategySettings"

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

  // Endpoint input (managed here since ConnectionSettings needs it and we sync with settings)
  const [endpointInput, setEndpointInput] = useState(settings.endpoint || "")

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
          interval={settings.interval.toString()}
          isOfflineMode={settings.isOfflineMode}
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
            <View style={styles.settingRow}>
              <View style={styles.settingContent}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
              </View>
              <Switch
                value={mode === "dark"}
                onValueChange={toggleTheme}
                trackColor={{
                  false: colors.border,
                  true: colors.primary + "80"
                }}
                thumbColor={mode === "dark" ? colors.primary : colors.border}
              />
            </View>
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

            <Divider />

            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
              onPress={() => navigation.navigate("API Config")}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>API Field Mapping</Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Customize JSON payload structure</Text>
              </View>
              <ChevronRight size={20} color={colors.textLight} />
            </Pressable>
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
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4
  },
  settingContent: {
    flex: 1,
    marginRight: 16
  },
  settingLabel: {
    fontSize: 16,
    ...fonts.semiBold,
    marginBottom: 2
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
  }
})
