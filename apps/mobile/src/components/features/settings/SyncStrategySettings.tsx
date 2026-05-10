/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, Switch, View, Pressable, TextInput, AppState } from "react-native"
import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react-native"
import { Settings, TRACKING_PRESETS, SelectablePreset, ThemeColors, SyncCondition } from "../../../types/global"
import { fonts, fontSizes } from "../../../styles/typography"
import { SYNC_INTERVAL_PRESETS, SYNC_INTERVAL_LABELS, OVERLAND_BATCH_MIN, OVERLAND_BATCH_MAX } from "../../../constants"
import { SectionTitle, Card, Divider, NumericInput, SettingRow } from "../../index"
import { PresetOption } from "./PresetOption"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../../../utils/geo"
import { isOverlandFormat } from "../../../utils/apiPayload"
import NativeLocationService from "../../../services/NativeLocationService"

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
  const [distanceInput, setDistanceInput] = useState(metersToInput(settings.distance ?? 0).toString())
  const [accuracyThresholdInput, setAccuracyThresholdInput] = useState(
    metersToInput(settings.accuracyThreshold).toString()
  )
  const [syncIntervalInput, setSyncIntervalInput] = useState(settings.syncInterval.toString())
  const [overlandBatchSizeInput, setOverlandBatchSizeInput] = useState(settings.overlandBatchSize.toString())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const showOverlandBatchSize = isOverlandFormat(settings.apiTemplate, settings.dawarichMode)
  const [currentSsid, setCurrentSsid] = useState("")

  useEffect(() => {
    if (settings.syncCondition !== "wifi_ssid") return

    const fetchSsid = () =>
      NativeLocationService.getCurrentSsid()
        .then(setCurrentSsid)
        .catch(() => {})
    fetchSsid()

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchSsid()
    })
    return () => sub.remove()
  }, [settings.syncCondition])

  const isCustomSyncInterval = !SYNC_INTERVAL_PRESETS.includes(settings.syncInterval)

  // Sync inputs with settings changes (e.g. preset selection)
  useEffect(() => {
    setIntervalInput(settings.interval.toString())
    setDistanceInput(metersToInput(settings.distance ?? 0).toString())
    setAccuracyThresholdInput(metersToInput(settings.accuracyThreshold).toString())
    setSyncIntervalInput(settings.syncInterval.toString())
    setOverlandBatchSizeInput(settings.overlandBatchSize.toString())
  }, [
    settings.interval,
    settings.distance,
    settings.accuracyThreshold,
    settings.syncInterval,
    settings.overlandBatchSize
  ])

  const handleNumericChange = useCallback(
    (key: "interval" | "distance" | "accuracyThreshold", value: string, min: number = 0) => {
      if (key === "interval") setIntervalInput(value)
      if (key === "distance") setDistanceInput(value)
      if (key === "accuracyThreshold") setAccuracyThresholdInput(value)

      const num = Number(value)
      if (!isNaN(num) && num >= min) {
        const stored = key === "distance" || key === "accuracyThreshold" ? inputToMeters(num) : num
        const next = { ...settings, [key]: stored, syncPreset: "custom" as const }
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
        if (key === "accuracyThreshold") setAccuracyThresholdInput(min.toString())

        const stored = key === "distance" || key === "accuracyThreshold" ? inputToMeters(val) : val
        const next = { ...settings, [key]: stored }
        onSettingsChange(next)
        onImmediateSave(next)
      }
    },
    [intervalInput, distanceInput, accuracyThresholdInput, settings, onSettingsChange, onImmediateSave]
  )

  const handlePresetSelect = useCallback(
    (preset: SelectablePreset) => {
      const config = TRACKING_PRESETS[preset]
      const next: Settings = {
        ...settings,
        syncPreset: preset,
        interval: config.interval,
        distance: config.distance,
        ...(settings.isOfflineMode ? {} : { syncInterval: config.syncInterval, retryInterval: config.retryInterval })
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
              <PresetOption
                preset={preset}
                isSelected={settings.syncPreset === preset}
                isOfflineMode={settings.isOfflineMode}
                onSelect={handlePresetSelect}
              />
            </View>
          ))}
        </View>

        <Divider />

        <Pressable
          style={({ pressed }) => [styles.advancedToggle, pressed && { opacity: colors.pressedOpacity }]}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={[styles.advancedText, { color: colors.text }]}>Advanced Settings</Text>
          {showAdvanced ? (
            <ChevronUp size={20} color={colors.textLight} />
          ) : (
            <ChevronDown size={20} color={colors.textLight} />
          )}
        </Pressable>

        {showAdvanced && (
          <View style={styles.advancedPanel}>
            {settings.syncPreset === "custom" && (
              <View style={[styles.customBanner, { backgroundColor: colors.info + "15" }]}>
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
                unit={shortDistanceUnit()}
                placeholder="10"
                hint="Only record if moved more than this distance"
                colors={colors}
              />
            </View>

            {!settings.isOfflineMode && (
              <>
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
                              pressed && { opacity: colors.pressedOpacity }
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
                          pressed && { opacity: colors.pressedOpacity }
                        ]}
                        onPress={() => {
                          if (!isCustomSyncInterval) {
                            const customValue = 1800
                            setSyncIntervalInput(customValue.toString())
                            handleGridSelect("syncInterval", customValue)
                          }
                        }}
                      >
                        <Text
                          style={[styles.gridLabel, { color: isCustomSyncInterval ? colors.primary : colors.text }]}
                        >
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

                  {showOverlandBatchSize && (
                    <View style={styles.customSyncInput}>
                      <NumericInput
                        label="Batch Size"
                        value={overlandBatchSizeInput}
                        onChange={(val) => {
                          setOverlandBatchSizeInput(val)
                          const num = Number(val)
                          if (!isNaN(num) && num >= OVERLAND_BATCH_MIN && num <= OVERLAND_BATCH_MAX) {
                            const next = { ...settings, overlandBatchSize: num }
                            onDebouncedSave(next)
                          }
                        }}
                        onBlur={() => {
                          let val = Number(overlandBatchSizeInput)
                          if (isNaN(val) || val < OVERLAND_BATCH_MIN) val = OVERLAND_BATCH_MIN
                          if (val > OVERLAND_BATCH_MAX) val = OVERLAND_BATCH_MAX
                          if (val !== settings.overlandBatchSize || overlandBatchSizeInput !== val.toString()) {
                            setOverlandBatchSizeInput(val.toString())
                            const next = { ...settings, overlandBatchSize: val }
                            onSettingsChange(next)
                            onImmediateSave(next)
                          }
                        }}
                        unit="points"
                        placeholder="50"
                        hint={`Points/upload (${OVERLAND_BATCH_MIN}-${OVERLAND_BATCH_MAX}). Larger = fewer requests, bigger payloads.`}
                        colors={colors}
                      />
                    </View>
                  )}

                  {/* Sync Condition */}
                  <View style={styles.settingRowSpaced}>
                    <Text style={[styles.blockLabel, { color: colors.text }]}>Sync Only On</Text>
                    <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
                      {settings.syncCondition === "any" && "Upload on any network connection"}
                      {settings.syncCondition === "wifi_any" && "Upload only when connected to Wi-Fi"}
                      {settings.syncCondition === "wifi_ssid" && "Upload only on a specific Wi-Fi network"}
                      {settings.syncCondition === "vpn" && "Upload only when VPN is active"}
                    </Text>
                    <View style={styles.syncConditionChips}>
                      {(
                        [
                          { value: "any", label: "Any" },
                          { value: "wifi_any", label: "Wi-Fi" },
                          { value: "wifi_ssid", label: "SSID" },
                          { value: "vpn", label: "VPN" }
                        ] as { value: SyncCondition; label: string }[]
                      ).map((option) => (
                        <Pressable
                          key={option.value}
                          onPress={() => {
                            const next = {
                              ...settings,
                              syncCondition: option.value,
                              syncPreset: "custom" as const
                            }
                            onSettingsChange(next)
                            onImmediateSave(next)
                          }}
                          style={[
                            styles.syncConditionChip,
                            {
                              backgroundColor:
                                settings.syncCondition === option.value ? colors.primary + "20" : colors.background,
                              borderColor: settings.syncCondition === option.value ? colors.primary : colors.border
                            }
                          ]}
                        >
                          <Text
                            style={[
                              styles.syncConditionChipText,
                              { color: settings.syncCondition === option.value ? colors.primary : colors.textSecondary }
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {settings.syncCondition === "wifi_ssid" && (
                      <View style={styles.ssidRow}>
                        <TextInput
                          style={[
                            styles.ssidInput,
                            { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }
                          ]}
                          value={settings.syncSsid}
                          onChangeText={(text) => {
                            const next = { ...settings, syncSsid: text }
                            onSettingsChange(next)
                            onDebouncedSave(next)
                          }}
                          placeholder="Enter Wi-Fi SSID"
                          placeholderTextColor={colors.placeholder}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {currentSsid !== "" && currentSsid.toLowerCase() !== settings.syncSsid.toLowerCase() && (
                          <Pressable
                            style={({ pressed }) => [
                              styles.ssidFillButton,
                              { borderColor: colors.primary, backgroundColor: colors.primary + "15" },
                              pressed && { opacity: colors.pressedOpacity }
                            ]}
                            onPress={() => {
                              const next = { ...settings, syncSsid: currentSsid }
                              onSettingsChange(next)
                              onImmediateSave(next)
                            }}
                          >
                            <Text style={[styles.ssidFillText, { color: colors.primary }]}>Use current</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                </View>

                <Divider />
              </>
            )}

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
                    unit={shortDistanceUnit()}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12
  },
  advancedText: {
    fontSize: 16,
    ...fonts.semiBold
  },
  advancedPanel: {
    marginTop: 16
  },
  customBanner: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 20
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
  },
  syncConditionChips: {
    flexDirection: "row",
    gap: 6
  },
  syncConditionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1
  },
  syncConditionChipText: {
    ...fonts.medium,
    fontSize: 12
  },
  ssidRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8
  },
  ssidInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontFamily: "monospace"
  },
  ssidFillButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1
  },
  ssidFillText: {
    ...fonts.medium,
    fontSize: 12
  }
})
