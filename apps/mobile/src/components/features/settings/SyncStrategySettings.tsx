/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, View, AppState } from "react-native"
import { ChevronDown, ChevronUp } from "lucide-react-native"
import { Settings, TRACKING_PRESETS, SelectablePreset, SyncCondition } from "../../../types/global"
import { useTheme } from "../../../hooks/useTheme"
import { useTranslation } from "../../../i18n/useTranslation"
import { text } from "../../../styles/typography"
import {
  size,
  space,
  SYNC_INTERVAL_PRESETS,
  SYNC_INTERVAL_LABELS,
  OVERLAND_BATCH_MIN,
  OVERLAND_BATCH_MAX
} from "../../../constants"
import {
  Button,
  ChipGroup,
  Divider,
  ListItem,
  Notice,
  NumericInput,
  RadioRow,
  SectionTitle,
  SettingRow,
  TextField,
  Toggle
} from "../../index"
import { PresetOption } from "./PresetOption"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../../../utils/geo"
import { isOverlandFormat } from "../../../utils/apiPayload"
import NativeLocationService from "../../../services/NativeLocationService"

const CUSTOM_SYNC_INTERVAL_SECONDS = 1800

interface SyncStrategySettingsProps {
  settings: Settings
  onSettingsChange: (newSettings: Settings) => void
  onDebouncedSave: (newSettings: Settings) => void
  onImmediateSave: (newSettings: Settings) => void
}

export function SyncStrategySettings({
  settings,
  onSettingsChange,
  onDebouncedSave,
  onImmediateSave
}: SyncStrategySettingsProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
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

  const handleSyncIntervalSelect = useCallback(
    (value: number) => {
      const next = { ...settings, syncInterval: value, syncPreset: "custom" as const }
      onSettingsChange(next)
      onDebouncedSave(next)
    },
    [settings, onSettingsChange, onDebouncedSave]
  )

  const handleSyncConditionSelect = useCallback(
    (value: SyncCondition) => {
      const next = { ...settings, syncCondition: value, syncPreset: "custom" as const }
      onSettingsChange(next)
      onImmediateSave(next)
    },
    [settings, onSettingsChange, onImmediateSave]
  )

  const syncConditionHint = t(`sync.condition.${settings.syncCondition}.hint`)

  return (
    <View>
      <SectionTitle first>{t("sync.trackingConfiguration")}</SectionTitle>

      <View accessibilityRole="radiogroup">
        {(Object.keys(TRACKING_PRESETS) as SelectablePreset[]).map((preset, index) => (
          <View key={preset}>
            {index > 0 && <Divider tight />}
            <PresetOption
              preset={preset}
              isSelected={settings.syncPreset === preset}
              isOfflineMode={settings.isOfflineMode}
              onSelect={handlePresetSelect}
            />
          </View>
        ))}
      </View>

      <Divider tight />

      <ListItem
        testID="advanced-settings-toggle"
        label={t("sync.advanced")}
        trailingIcon={showAdvanced ? ChevronUp : ChevronDown}
        onPress={() => setShowAdvanced(!showAdvanced)}
      />

      {showAdvanced && (
        <View>
          {settings.syncPreset === "custom" && (
            <View style={styles.notice}>
              <Notice variant="info" title={t("sync.customConfiguration")} />
            </View>
          )}

          <SectionTitle>{t("sync.trackingParameters")}</SectionTitle>

          <NumericInput
            label={t("sync.interval")}
            value={intervalInput}
            onChange={(val) => handleNumericChange("interval", val, 1)}
            onBlur={() => handleNumericBlur("interval", 1)}
            unit={t("sync.unit.seconds")}
            placeholder="1"
            hint={t("sync.interval.hint")}
          />

          <Divider tight />

          <NumericInput
            label={t("sync.movementThreshold")}
            value={distanceInput}
            onChange={(val) => handleNumericChange("distance", val, 0)}
            onBlur={() => handleNumericBlur("distance", 0)}
            unit={shortDistanceUnit()}
            placeholder="10"
            hint={t("sync.movementThreshold.hint")}
          />

          {!settings.isOfflineMode && (
            <>
              <SectionTitle>{t("sync.syncInterval")}</SectionTitle>
              <Text style={[styles.groupHint, { color: colors.textSecondary }]}>{t("sync.syncInterval.hint")}</Text>

              <View accessibilityRole="radiogroup">
                {SYNC_INTERVAL_PRESETS.map((sec) => (
                  <View key={sec}>
                    <RadioRow
                      label={SYNC_INTERVAL_LABELS[sec]}
                      selected={settings.syncInterval === sec && !isCustomSyncInterval}
                      onPress={() => handleSyncIntervalSelect(sec)}
                    />
                    <Divider tight />
                  </View>
                ))}
                <RadioRow
                  label={t("sync.custom")}
                  selected={isCustomSyncInterval}
                  onPress={() => {
                    if (!isCustomSyncInterval) {
                      setSyncIntervalInput(CUSTOM_SYNC_INTERVAL_SECONDS.toString())
                      handleSyncIntervalSelect(CUSTOM_SYNC_INTERVAL_SECONDS)
                    }
                  }}
                />
              </View>

              {isCustomSyncInterval && (
                <View style={styles.indented}>
                  <NumericInput
                    label={t("sync.customInterval")}
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
                    unit={t("sync.unit.seconds")}
                    placeholder="1800"
                    hint={t("sync.customInterval.hint")}
                  />
                </View>
              )}

              {showOverlandBatchSize && (
                <>
                  <Divider tight />
                  <NumericInput
                    label={t("sync.batchSize")}
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
                    unit={t("sync.unit.points")}
                    placeholder="50"
                    hint={t("sync.batchSize.hint", { min: OVERLAND_BATCH_MIN, max: OVERLAND_BATCH_MAX })}
                  />
                </>
              )}

              <SectionTitle>{t("sync.syncOnlyOn")}</SectionTitle>
              <Text style={[styles.groupHint, { color: colors.textSecondary }]}>{syncConditionHint}</Text>

              <ChipGroup
                accessibilityLabel={t("sync.syncOnlyOn")}
                options={[
                  { value: "any", label: t("sync.condition.any") },
                  { value: "wifi_any", label: t("sync.condition.wifi_any") },
                  { value: "wifi_ssid", label: t("sync.condition.wifi_ssid") },
                  { value: "vpn", label: t("sync.condition.vpn") }
                ]}
                selected={settings.syncCondition}
                onSelect={handleSyncConditionSelect}
              />

              {settings.syncCondition === "wifi_ssid" && (
                <View style={styles.ssidBlock}>
                  <TextField
                    label={t("sync.ssid")}
                    mono
                    value={settings.syncSsid}
                    onChangeText={(value) => {
                      const next = { ...settings, syncSsid: value }
                      onSettingsChange(next)
                      onDebouncedSave(next)
                    }}
                    placeholder={t("sync.ssid.placeholder")}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {currentSsid !== "" && currentSsid.toLowerCase() !== settings.syncSsid.toLowerCase() && (
                    <Button
                      title={t("sync.ssid.useCurrent", { ssid: currentSsid })}
                      variant="ghost"
                      align="start"
                      onPress={() => {
                        const next = { ...settings, syncSsid: currentSsid }
                        onSettingsChange(next)
                        onImmediateSave(next)
                      }}
                    />
                  )}
                </View>
              )}
            </>
          )}

          <SectionTitle>{t("sync.qualityFilters")}</SectionTitle>

          <SettingRow label={t("sync.filterInaccurate")} hint={t("sync.filterInaccurate.hint")}>
            <Toggle
              value={settings.filterInaccurateLocations}
              onValueChange={(value) =>
                onImmediateSave({
                  ...settings,
                  filterInaccurateLocations: value
                })
              }
              accessibilityLabel={t("sync.filterInaccurate")}
            />
          </SettingRow>

          {settings.filterInaccurateLocations && (
            <View style={styles.indented}>
              <NumericInput
                label={t("sync.accuracyThreshold")}
                value={accuracyThresholdInput}
                onChange={(val) => handleNumericChange("accuracyThreshold", val, 1)}
                onBlur={() => handleNumericBlur("accuracyThreshold", 1)}
                unit={shortDistanceUnit()}
                placeholder="50"
                hint={t("sync.accuracyThreshold.hint")}
              />
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  notice: {
    marginTop: space.lg
  },
  groupHint: {
    ...text.label,
    marginBottom: space.sm
  },
  // A field that belongs to the row above it starts at that row's text column.
  indented: {
    marginStart: size.iconColumn
  },
  ssidBlock: {
    marginTop: space.lg
  }
})
