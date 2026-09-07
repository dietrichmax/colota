/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useMemo } from "react"
import { Text, StyleSheet, View, Pressable, AppState } from "react-native"
import { Settings, TRACKING_PRESETS, SelectablePreset, ThemeColors, SyncCondition } from "../../../types/global"
import { fonts, fontSizes, lineHeights } from "../../../styles/typography"
import { HIT_SLOP_MD, OVERLAND_BATCH_MAX, OVERLAND_BATCH_MIN, size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { Card, NumericInput, RadioRow, SectionTitle, SettingRow, TextField, Toggle } from "../../index"
import { SyncIntervalPicker } from "./SyncIntervalPicker"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../../../utils/geo"
import { isOverlandFormat } from "../../../utils/apiPayload"
import NativeLocationService from "../../../services/NativeLocationService"
import { radius } from "@colota/shared"

interface SyncStrategySettingsProps {
  settings: Settings
  onSettingsChange: (newSettings: Settings) => void
  onDebouncedSave: (newSettings: Settings) => void
  onImmediateSave: (newSettings: Settings) => void
  activeProfileName?: string | null
  colors: ThemeColors
}

const SYNC_CONDITION_OPTIONS: { value: SyncCondition; label: string; sub: string }[] = [
  { value: "any", label: "Any network", sub: "Uploads over mobile data as well as Wi-Fi" },
  { value: "wifi_any", label: "Wi-Fi", sub: "Uploads only while connected to any Wi-Fi" },
  { value: "wifi_ssid", label: "Specific Wi-Fi network", sub: "Uploads only on one network you choose" },
  { value: "vpn", label: "VPN", sub: "Uploads only while a VPN is active" }
]

function presetSummary(preset: SelectablePreset, isOfflineMode: boolean): string {
  const config = TRACKING_PRESETS[preset]
  const base = isOfflineMode ? config.description.split(" • ")[0] : config.description
  if (preset === "balanced") return `${base} • recommended`
  if (config.batteryImpact === "High") return `${base} • high battery`
  return base
}

export function SyncStrategySettings({
  settings,
  onSettingsChange,
  onDebouncedSave,
  onImmediateSave,
  activeProfileName,
  colors
}: SyncStrategySettingsProps) {
  const [intervalInput, setIntervalInput] = useState(settings.interval.toString())
  const [distanceInput, setDistanceInput] = useState(metersToInput(settings.distance ?? 0).toString())
  const [accuracyThresholdInput, setAccuracyThresholdInput] = useState(
    metersToInput(settings.accuracyThreshold).toString()
  )
  const [overlandBatchSizeInput, setOverlandBatchSizeInput] = useState(settings.overlandBatchSize.toString())
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

  // Sync inputs with settings changes (e.g. preset selection)
  useEffect(() => {
    setIntervalInput(settings.interval.toString())
    setDistanceInput(metersToInput(settings.distance ?? 0).toString())
    setAccuracyThresholdInput(metersToInput(settings.accuracyThreshold).toString())
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

  const isCustomPreset = settings.syncPreset === "custom"

  const customSummary = useMemo(() => {
    const track = `Track every ${settings.interval}s`
    if (settings.isOfflineMode) return track
    const send = settings.syncInterval === 0 ? "Send instantly" : `Batch ${Math.round(settings.syncInterval / 60)} min`
    return `${track} • ${send}`
  }, [settings.interval, settings.syncInterval, settings.isOfflineMode])

  const handleCustomSelect = useCallback(() => {
    const next: Settings = { ...settings, syncPreset: "custom" }
    onSettingsChange(next)
    onImmediateSave(next)
  }, [settings, onSettingsChange, onImmediateSave])

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
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        How often a fix is recorded, and when it uploads
      </Text>
      {activeProfileName ? (
        <Text testID="profile-override-notice" style={[styles.override, { color: colors.warning }]}>
          {activeProfileName} is active and is overriding these values while its condition holds.
        </Text>
      ) : null}
      <SectionTitle>Tracking configuration</SectionTitle>
      <Card rows>
        <View accessibilityRole="radiogroup">
          {(Object.keys(TRACKING_PRESETS) as SelectablePreset[]).map((preset) => (
            <RadioRow
              key={preset}
              testID={`preset-${preset}`}
              label={TRACKING_PRESETS[preset].label}
              sub={presetSummary(preset, settings.isOfflineMode)}
              selected={settings.syncPreset === preset}
              onPress={() => handlePresetSelect(preset)}
            />
          ))}
          <RadioRow
            testID="preset-custom"
            label="Custom"
            sub={customSummary}
            selected={isCustomPreset}
            onPress={handleCustomSelect}
          />

          {isCustomPreset && (
            <View style={styles.customParams}>
              <NumericInput
                label="Tracking interval"
                value={intervalInput}
                onChange={(val) => handleNumericChange("interval", val, 1)}
                onBlur={() => handleNumericBlur("interval", 1)}
                unit="seconds"
                placeholder="1"
                hint="How often to capture GPS position"
              />

              <NumericInput
                label="Movement threshold"
                value={distanceInput}
                onChange={(val) => handleNumericChange("distance", val, 0)}
                onBlur={() => handleNumericBlur("distance", 0)}
                unit={shortDistanceUnit()}
                placeholder="10"
                hint="Only record if moved more than this distance"
              />
            </View>
          )}
        </View>
      </Card>

      {!settings.isOfflineMode && (
        <>
          <SectionTitle style={styles.groupTop}>Network settings</SectionTitle>
          <Card rows>
            <View style={styles.settingBlock}>
              <SyncIntervalPicker
                label="Sync interval"
                hint="How often to upload data to server"
                value={settings.syncInterval}
                onSelect={(seconds) => handleGridSelect("syncInterval", seconds)}
                onChange={(seconds) => onDebouncedSave({ ...settings, syncInterval: seconds, syncPreset: "custom" })}
                onClamp={(seconds) => {
                  const next = { ...settings, syncInterval: seconds, syncPreset: "custom" as const }
                  onSettingsChange(next)
                  onImmediateSave(next)
                }}
              />
            </View>

            {showOverlandBatchSize && (
              <View style={styles.customSyncInput}>
                <NumericInput
                  label="Batch size"
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
                />
              </View>
            )}

            {/* Sync Condition */}
            <View style={styles.settingBlock}>
              <Text style={[styles.blockLabel, { color: colors.text }]}>Sync only on</Text>
              <View accessibilityRole="radiogroup">
                {SYNC_CONDITION_OPTIONS.map(({ value, label, sub }) => (
                  <React.Fragment key={value}>
                    <RadioRow
                      testID={`sync-condition-${value}`}
                      label={label}
                      sub={sub}
                      selected={settings.syncCondition === value}
                      onPress={() => {
                        const next = { ...settings, syncCondition: value, syncPreset: "custom" as const }
                        onSettingsChange(next)
                        onImmediateSave(next)
                      }}
                    />
                    {/* Belongs to its own row, not to the end of the group: VPN sits below it. */}
                    {value === "wifi_ssid" && settings.syncCondition === "wifi_ssid" && (
                      <View style={styles.ssidRow}>
                        <TextField
                          accessibilityLabel="Wi-Fi SSID"
                          testID="sync-ssid-input"
                          style={styles.ssidField}
                          mono
                          value={settings.syncSsid}
                          onChangeText={(text) => {
                            const next = { ...settings, syncSsid: text }
                            onSettingsChange(next)
                            onDebouncedSave(next)
                          }}
                          placeholder="Enter Wi-Fi SSID"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {currentSsid !== "" && currentSsid.toLowerCase() !== settings.syncSsid.toLowerCase() && (
                          <Pressable
                            hitSlop={HIT_SLOP_MD}
                            accessibilityRole="button"
                            android_ripple={{ color: colors.primary + STATE_LAYER_ALPHA }}
                            style={[styles.ssidFillButton, { backgroundColor: colors.primary + "15" }]}
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
                  </React.Fragment>
                ))}
              </View>
            </View>
          </Card>
        </>
      )}

      <SectionTitle style={styles.groupTop}>Quality filters</SectionTitle>
      <Card rows style={styles.cardTail}>
        <SettingRow label="Filter inaccurate locations" hint="Reject fixes the GPS chip reports as imprecise">
          <Toggle
            accessibilityLabel="Filter inaccurate locations"
            value={settings.filterInaccurateLocations}
            onValueChange={(value) =>
              onImmediateSave({
                ...settings,
                filterInaccurateLocations: value
              })
            }
          />
        </SettingRow>

        {settings.filterInaccurateLocations && (
          <View style={styles.nestedSetting}>
            <NumericInput
              label="Accuracy threshold"
              value={accuracyThresholdInput}
              onChange={(val) => handleNumericChange("accuracyThreshold", val, 1)}
              onBlur={() => handleNumericBlur("accuracyThreshold", 1)}
              unit={shortDistanceUnit()}
              placeholder="50"
              hint="Based on the chip's own estimate, which can be optimistic"
            />
          </View>
        )}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  override: {
    fontSize: fontSizes.description,
    ...fonts.medium,
    lineHeight: lineHeights.description,
    marginTop: -space.sm,
    marginBottom: space.lg
  },
  section: {
    marginBottom: space.xl
  },
  customParams: {
    paddingLeft: size.iconColumn,
    paddingBottom: space.lg,
    gap: space.lg
  },
  groupTop: {
    marginTop: space.xl
  },
  cardTail: {
    paddingBottom: space.lg
  },
  settingBlock: {
    paddingTop: space.lg,
    paddingBottom: space.lg
  },
  blockLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: space.xs
  },
  blockHint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginBottom: space.md,
    lineHeight: lineHeights.description
  },
  nestedSetting: {
    marginTop: space.md,
    marginStart: space.lg
  },
  customSyncInput: {
    marginTop: space.md
  },
  // Indents and spaces itself the way the custom preset parameters do. The row above already pays
  // space.lg below it, so a top margin here would push the field nearer VPN than its own option.
  ssidRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: size.iconColumn,
    marginTop: -space.xs,
    paddingBottom: space.lg,
    gap: space.sm
  },
  ssidField: {
    flex: 1
  },
  ssidFillButton: {
    overflow: "hidden",
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: size.chip,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm
  },
  ssidFillText: {
    ...fonts.medium,
    fontSize: fontSizes.caption
  }
})
