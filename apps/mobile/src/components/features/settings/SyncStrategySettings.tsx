/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, Switch, View, Pressable } from "react-native"
import { Lightbulb } from "lucide-react-native"
import { Settings, TRACKING_PRESETS, SyncPreset, SelectablePreset, ThemeColors } from "../../../types/global"
import { fonts, fontSizes } from "../../../styles/typography"
import { SYNC_INTERVAL_PRESETS, SYNC_INTERVAL_LABELS } from "../../../constants"
import { SectionTitle, Card, Divider, NumericInput, SettingRow } from "../../index"
import { PresetOption } from "./PresetOption"

interface SyncStrategySettingsProps {
  settings: Settings
  onSettingsChange: (newSettings: Settings) => void
  onDebouncedSave: (newSettings: Settings) => void
  onImmediateSave: (newSettings: Settings) => void
  colors: ThemeColors
}

export function SyncStrategySettings({
  settings,
  onSettingsChange,
  onDebouncedSave,
  onImmediateSave,
  colors
}: SyncStrategySettingsProps) {
  const [intervalInput, setIntervalInput] = useState(settings.interval.toString())
  const [distanceInput, setDistanceInput] = useState(settings.distance?.toString() || "0")
  const [accuracyThresholdInput, setAccuracyTresholdInput] = useState(settings.accuracyThreshold.toString())
  const [syncIntervalInput, setSyncIntervalInput] = useState(settings.syncInterval.toString())
  const [showAdvanced, setShowAdvanced] = useState(false)

  const isCustomSyncInterval = !SYNC_INTERVAL_PRESETS.includes(settings.syncInterval)

  // Sync inputs with settings changes (e.g. preset selection)
  useEffect(() => {
    setIntervalInput(settings.interval.toString())
    setDistanceInput(settings.distance?.toString() || "0")
    setAccuracyTresholdInput(settings.accuracyThreshold.toString())
    setSyncIntervalInput(settings.syncInterval.toString())
  }, [settings.interval, settings.distance, settings.accuracyThreshold, settings.syncInterval])

  const handleNumericChange = useCallback(
    (key: "interval" | "distance" | "accuracyThreshold", value: string, min: number = 0) => {
      if (key === "interval") setIntervalInput(value)
      if (key === "distance") setDistanceInput(value)
      if (key === "accuracyThreshold") setAccuracyTresholdInput(value)

      const num = Number(value)
      if (!isNaN(num) && num >= min) {
        const next = { ...settings, [key]: num, syncPreset: "custom" as const }
        onDebouncedSave(next)
      }
    },
    [settings, onDebouncedSave]
  )

  const handleNumericBlur = useCallback(
    (key: "interval" | "distance" | "accuracyThreshold", min: number = 0) => {
      const currentStr =
        key === "interval" ? intervalInput : key === "distance" ? distanceInput : accuracyThresholdInput
      let val = Number(currentStr)

      if (isNaN(val) || val < min) {
        val = min
        if (key === "interval") setIntervalInput(min.toString())
        if (key === "distance") setDistanceInput(min.toString())
        if (key === "accuracyThreshold") setAccuracyTresholdInput(min.toString())

        const next = { ...settings, [key]: val }
        onSettingsChange(next)
        onImmediateSave(next)
      }
    },
    [intervalInput, distanceInput, accuracyThresholdInput, settings, onSettingsChange, onImmediateSave]
  )

  const handlePresetSelect = useCallback(
    (preset: SyncPreset) => {
      if (preset === "custom") {
        const next = { ...settings, syncPreset: "custom" as const }
        onSettingsChange(next)
        onImmediateSave(next)
        return
      }

      const config = TRACKING_PRESETS[preset]
      const next: Settings = {
        ...settings,
        syncPreset: preset,
        interval: config.interval,
        distance: config.distance,
        syncInterval: config.syncInterval,
        retryInterval: config.retryInterval
      }

      onSettingsChange(next)
      onImmediateSave(next)
    },
    [settings, onSettingsChange, onImmediateSave]
  )

  const handleGridSelect = useCallback(
    (key: string, value: number) => {
      const next = {
        ...settings,
        [key]: value,
        syncPreset: "custom" as const
      }
      onSettingsChange(next)
      onDebouncedSave(next)
    },
    [settings, onSettingsChange, onDebouncedSave]
  )

  return (
    <View style={styles.section}>
      <SectionTitle>Tracking Configuration</SectionTitle>
      <Card>
        <View accessibilityRole="radiogroup">
          {(Object.keys(TRACKING_PRESETS) as SelectablePreset[]).map((preset, index) => (
            <View key={preset}>
              {index > 0 && <View style={styles.presetSpacer} />}
              <PresetOption preset={preset} isSelected={settings.syncPreset === preset} onSelect={handlePresetSelect} />
            </View>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.advancedToggle,
            { borderColor: showAdvanced ? colors.primary : colors.border },
            pressed && { opacity: 0.7 }
          ]}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={[styles.advancedText, { color: colors.primaryDark }]}>
            {showAdvanced ? "− Hide" : "+ Show"} Advanced Settings
          </Text>
        </Pressable>

        {showAdvanced && (
          <View style={styles.advancedPanel}>
            <Divider />

            {settings.syncPreset === "custom" && (
              <View
                style={[
                  styles.customBanner,
                  {
                    backgroundColor: colors.info + "15",
                    borderLeftColor: colors.info
                  }
                ]}
              >
                <View style={styles.bannerRow}>
                  <Lightbulb size={14} color={colors.info} />
                  <Text style={[styles.customBannerText, { color: colors.info }]}>Using custom configuration</Text>
                </View>
              </View>
            )}

            {/* Tracking Parameters Group */}
            <View style={styles.paramGroup}>
              <Text style={[styles.paramGroupTitle, { color: colors.text }]}>Tracking Parameters</Text>

              <NumericInput
                label="Tracking Interval"
                value={intervalInput}
                onChange={(val) => handleNumericChange("interval", val, 1)}
                onBlur={() => handleNumericBlur("interval", 1)}
                unit="seconds"
                placeholder="1"
                hint="How often to capture GPS position"
                colors={colors}
              />

              <NumericInput
                label="Movement Threshold"
                value={distanceInput}
                onChange={(val) => handleNumericChange("distance", val, 0)}
                onBlur={() => handleNumericBlur("distance", 0)}
                unit="meters"
                placeholder="10"
                hint="Only record if moved more than this distance"
                colors={colors}
              />
            </View>

            <Divider />

            {/* Network Parameters Group */}
            <View style={styles.paramGroup}>
              <Text style={[styles.paramGroupTitle, { color: colors.text }]}>Network Settings</Text>

              {/* Sync Interval */}
              <View style={styles.settingBlock}>
                <Text style={[styles.blockLabel, { color: colors.text }]}>Sync Interval</Text>
                <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
                  How often to upload data to server
                </Text>

                <View style={styles.optionsGrid}>
                  {SYNC_INTERVAL_PRESETS.map((sec) => {
                    const isSelected = settings.syncInterval === sec && !isCustomSyncInterval
                    return (
                      <Pressable
                        key={sec}
                        style={({ pressed }) => [
                          styles.gridOption,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.background
                          },
                          isSelected && {
                            borderColor: colors.primary,
                            backgroundColor: colors.primary + "20"
                          },
                          pressed && { opacity: 0.7 }
                        ]}
                        onPress={() => handleGridSelect("syncInterval", sec)}
                      >
                        <Text style={[styles.gridLabel, { color: isSelected ? colors.primary : colors.text }]}>
                          {SYNC_INTERVAL_LABELS[sec]}
                        </Text>
                      </Pressable>
                    )
                  })}
                  <Pressable
                    style={({ pressed }) => [
                      styles.gridOption,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background
                      },
                      isCustomSyncInterval && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primary + "20"
                      },
                      pressed && { opacity: 0.7 }
                    ]}
                    onPress={() => {
                      if (!isCustomSyncInterval) {
                        const customValue = 1800
                        setSyncIntervalInput(customValue.toString())
                        handleGridSelect("syncInterval", customValue)
                      }
                    }}
                  >
                    <Text style={[styles.gridLabel, { color: isCustomSyncInterval ? colors.primary : colors.text }]}>
                      Custom
                    </Text>
                  </Pressable>
                </View>
              </View>

              {isCustomSyncInterval && (
                <View style={styles.customSyncInput}>
                  <NumericInput
                    label="Custom Sync Interval"
                    value={syncIntervalInput}
                    onChange={(val) => {
                      setSyncIntervalInput(val)
                      const num = Number(val)
                      if (!isNaN(num) && num >= 1) {
                        const next = { ...settings, syncInterval: num, syncPreset: "custom" as const }
                        onDebouncedSave(next)
                      }
                    }}
                    onBlur={() => {
                      let val = Number(syncIntervalInput)
                      if (isNaN(val) || val < 1) {
                        val = 1
                        setSyncIntervalInput("1")
                        const next = { ...settings, syncInterval: val, syncPreset: "custom" as const }
                        onSettingsChange(next)
                        onImmediateSave(next)
                      }
                    }}
                    unit="seconds"
                    placeholder="1800"
                    hint="Custom interval in seconds"
                    colors={colors}
                  />
                </View>
              )}

              {/* Retry Forever Toggle */}
              <SettingRow
                label="Retry Failed Uploads"
                hint={
                  settings.maxRetries === 0
                    ? "Failed uploads stay in the queue until they succeed"
                    : "Failed uploads are permanently deleted after 5 failed send attempts"
                }
              >
                <Switch
                  value={settings.maxRetries === 0}
                  onValueChange={(retryForever) => {
                    const next = {
                      ...settings,
                      maxRetries: retryForever ? 0 : 5,
                      syncPreset: "custom" as const
                    }
                    onSettingsChange(next)
                    onImmediateSave(next)
                  }}
                  trackColor={{
                    false: colors.border,
                    true: colors.primary + "80"
                  }}
                  thumbColor={settings.maxRetries === 0 ? colors.primary : colors.border}
                />
              </SettingRow>

              {/* Wi-Fi Only Sync Toggle */}
              <SettingRow
                label="Wi-Fi Only Sync"
                hint="Only upload when connected to Wi-Fi"
                style={styles.settingRowSpaced}
              >
                <Switch
                  value={settings.isWifiOnlySync}
                  onValueChange={(value) => {
                    const next = {
                      ...settings,
                      isWifiOnlySync: value,
                      syncPreset: "custom" as const
                    }
                    onSettingsChange(next)
                    onImmediateSave(next)
                  }}
                  trackColor={{
                    false: colors.border,
                    true: colors.primary + "80"
                  }}
                  thumbColor={settings.isWifiOnlySync ? colors.primary : colors.border}
                />
              </SettingRow>
            </View>

            <Divider />

            {/* Quality Parameters Group */}
            <View style={styles.paramGroup}>
              <Text style={[styles.paramGroupTitle, { color: colors.text }]}>Quality Filters</Text>

              <SettingRow label="Filter Inaccurate Locations" hint="Reject low-accuracy GPS readings">
                <Switch
                  value={settings.filterInaccurateLocations}
                  onValueChange={(value) =>
                    onImmediateSave({
                      ...settings,
                      filterInaccurateLocations: value
                    })
                  }
                  trackColor={{
                    false: colors.border,
                    true: colors.primary + "80"
                  }}
                  thumbColor={settings.filterInaccurateLocations ? colors.primary : colors.border}
                />
              </SettingRow>

              {settings.filterInaccurateLocations && (
                <View style={[styles.nestedSetting, { borderLeftColor: colors.border }]}>
                  <NumericInput
                    label="Accuracy Threshold"
                    value={accuracyThresholdInput}
                    onChange={(val) => handleNumericChange("accuracyThreshold", val, 1)}
                    onBlur={() => handleNumericBlur("accuracyThreshold", 1)}
                    unit="meters"
                    placeholder="50"
                    hint="Reject readings with accuracy worse than this"
                    colors={colors}
                  />
                </View>
              )}
            </View>
          </View>
        )}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24
  },
  presetSpacer: {
    height: 8
  },
  advancedToggle: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 16
  },
  advancedText: {
    fontSize: 15,
    ...fonts.semiBold
  },
  advancedPanel: {
    marginTop: 16
  },
  customBanner: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    borderLeftWidth: 4
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  customBannerText: {
    fontSize: 13,
    ...fonts.medium
  },
  paramGroup: {
    marginBottom: 4
  },
  paramGroupTitle: {
    fontSize: 13,
    ...fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
    opacity: 0.6
  },
  settingBlock: {
    marginBottom: 20
  },
  blockLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 4
  },
  blockHint: {
    fontSize: 13,
    ...fonts.regular,
    marginBottom: 12,
    lineHeight: 18
  },
  optionsGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  gridOption: {
    width: "31%", // ~3 per row with gap in a flexWrap container
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center"
  },
  gridLabel: {
    fontSize: 14,
    ...fonts.semiBold
  },
  settingRowSpaced: {
    marginTop: 16
  },
  nestedSetting: {
    marginTop: 12,
    paddingLeft: 16,
    borderLeftWidth: 3
  },
  customSyncInput: {
    marginTop: 12
  }
})
