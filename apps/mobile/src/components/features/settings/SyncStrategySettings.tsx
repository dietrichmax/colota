/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, View, AppState } from "react-native"
import { UserRoundPen } from "lucide-react-native"
import {
  Settings,
  TRACKING_PRESETS,
  SelectablePreset,
  SyncCondition,
  SavedTrackingProfile
} from "../../../types/global"
import { fonts, fontSizes, lineHeights } from "../../../styles/typography"
import { OVERLAND_BATCH_MAX, OVERLAND_BATCH_MIN, SAVE_SUCCESS_DISPLAY_MS, size, space } from "../../../constants"
import {
  Button,
  Card,
  Divider,
  NumericInput,
  RadioRow,
  SectionTitle,
  SettingRow,
  StateLine,
  TextField,
  Toggle
} from "../../index"
import { SyncIntervalPicker } from "./SyncIntervalPicker"
import { useTheme } from "../../../hooks/useTheme"
import { useTimeout } from "../../../hooks/useTimeout"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../../../utils/geo"
import { syncSummary, trackingSummary } from "../../../utils/dashboardState"
import { recordingPhrase } from "../../../utils/profileRow"
import { parseWholeNumber, wholeNumberError } from "../../../utils/settingsValidation"
import { isOverlandFormat } from "../../../utils/apiPayload"
import NativeLocationService from "../../../services/NativeLocationService"
import { useTranslation } from "../../../i18n/useTranslation"
import type { TranslationKey } from "../../../i18n/options"

interface SyncStrategySettingsProps {
  settings: Settings
  onSettingsChange: (newSettings: Settings) => void
  onDebouncedSave: (newSettings: Settings) => void
  onImmediateSave: (newSettings: Settings) => void
  /** The profile in force, whose values the Recording and Sync interval groups then show as overridden. */
  activeProfile?: SavedTrackingProfile | null
}

type NumericKey = "interval" | "distance" | "accuracyThreshold"

const NUMERIC_MIN: Record<NumericKey, number> = { interval: 1, distance: 0, accuracyThreshold: 1 }

const SYNC_CONDITION_OPTIONS: { value: SyncCondition; labelKey: TranslationKey; subKey: TranslationKey }[] = [
  { value: "any", labelKey: "trackingSync.condition.any", subKey: "trackingSync.condition.any.sub" },
  { value: "wifi_any", labelKey: "trackingSync.condition.wifiAny", subKey: "trackingSync.condition.wifiAny.sub" },
  { value: "wifi_ssid", labelKey: "trackingSync.condition.wifiSsid", subKey: "trackingSync.condition.wifiSsid.sub" },
  { value: "vpn", labelKey: "trackingSync.condition.vpn", subKey: "trackingSync.condition.vpn.sub" }
]

export function SyncStrategySettings({
  settings,
  onSettingsChange,
  onDebouncedSave,
  onImmediateSave,
  activeProfile = null
}: SyncStrategySettingsProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const unit = shortDistanceUnit()
  const [intervalInput, setIntervalInput] = useState(settings.interval.toString())
  const [distanceInput, setDistanceInput] = useState(metersToInput(settings.distance ?? 0).toString())
  const [accuracyThresholdInput, setAccuracyThresholdInput] = useState(
    metersToInput(settings.accuracyThreshold).toString()
  )
  const [overlandBatchSizeInput, setOverlandBatchSizeInput] = useState(settings.overlandBatchSize.toString())
  const [clampMessage, setClampMessage] = useState<{ key: string; text: string } | null>(null)
  const clampTimer = useTimeout()
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

  // A preset press rewrites the fields; a keystroke that already means the stored value keeps its text.
  useEffect(() => {
    const keep = (shown: number) => (text: string) => (parseWholeNumber(text) === shown ? text : shown.toString())
    setIntervalInput(keep(settings.interval))
    setDistanceInput(keep(metersToInput(settings.distance ?? 0)))
    setAccuracyThresholdInput(keep(metersToInput(settings.accuracyThreshold)))
    setOverlandBatchSizeInput(keep(settings.overlandBatchSize))
  }, [settings.interval, settings.distance, settings.accuracyThreshold, settings.overlandBatchSize])

  const noteClamp = (key: string, text: string) => {
    setClampMessage({ key, text })
    clampTimer.set(() => setClampMessage(null), SAVE_SUCCESS_DISPLAY_MS)
  }
  const clampNote = (key: string) => (clampMessage?.key === key ? clampMessage.text : undefined)

  const setInput = (key: NumericKey, value: string) => {
    if (key === "interval") setIntervalInput(value)
    if (key === "distance") setDistanceInput(value)
    if (key === "accuracyThreshold") setAccuracyThresholdInput(value)
  }
  const inputOf = (key: NumericKey) =>
    key === "interval" ? intervalInput : key === "distance" ? distanceInput : accuracyThresholdInput
  const toStored = (key: NumericKey, value: number) => (key === "interval" ? value : inputToMeters(value))

  const handleNumericChange = (key: NumericKey, value: string) => {
    setInput(key, value)
    setClampMessage(null)
    const num = parseWholeNumber(value)
    if (num === null || num < NUMERIC_MIN[key]) return
    const next = { ...settings, [key]: toStored(key, num) }
    onSettingsChange(next)
    onDebouncedSave(next)
  }

  const handleNumericBlur = (key: NumericKey) => {
    const min = NUMERIC_MIN[key]
    const num = parseWholeNumber(inputOf(key))
    if (num !== null && num >= min) return
    setInput(key, min.toString())
    noteClamp(key, t("validation.setTo", { value: min, unit: key === "interval" ? t("unit.s") : unit }))
    const next = { ...settings, [key]: toStored(key, min) }
    onSettingsChange(next)
    onImmediateSave(next)
  }

  const isCustomPreset = settings.syncPreset === "custom"

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

  // A preset owns the sync interval, so changing it is Custom; nothing else on the screen flips the preset.
  const handleSyncIntervalChange = useCallback(
    (seconds: number, save: (next: Settings) => void) => {
      const next: Settings = { ...settings, syncInterval: seconds, syncPreset: "custom" }
      onSettingsChange(next)
      save(next)
    },
    [settings, onSettingsChange]
  )

  const handleBatchChange = (value: string) => {
    setOverlandBatchSizeInput(value)
    setClampMessage(null)
    const num = parseWholeNumber(value)
    if (num === null || num < OVERLAND_BATCH_MIN || num > OVERLAND_BATCH_MAX) return
    const next = { ...settings, overlandBatchSize: num }
    onSettingsChange(next)
    onDebouncedSave(next)
  }

  const handleBatchBlur = () => {
    const num = parseWholeNumber(overlandBatchSizeInput)
    if (num !== null && num >= OVERLAND_BATCH_MIN && num <= OVERLAND_BATCH_MAX) return
    const clamped = num === null || num < OVERLAND_BATCH_MIN ? OVERLAND_BATCH_MIN : OVERLAND_BATCH_MAX
    setOverlandBatchSizeInput(clamped.toString())
    noteClamp("batch", t("trackingSync.batch.setTo", { count: clamped, n: clamped }))
    const next = { ...settings, overlandBatchSize: clamped }
    onSettingsChange(next)
    onImmediateSave(next)
  }

  const batchError = (() => {
    if (overlandBatchSizeInput === "") return undefined
    const num = parseWholeNumber(overlandBatchSizeInput)
    if (num === null) return t("validation.wholeNumber")
    if (num < OVERLAND_BATCH_MIN || num > OVERLAND_BATCH_MAX)
      return t("trackingSync.batch.range", { min: OVERLAND_BATCH_MIN, max: OVERLAND_BATCH_MAX })
    return undefined
  })()

  const presetSub = (preset: SelectablePreset) => {
    const config = TRACKING_PRESETS[preset]
    return `${trackingSummary(config.interval, config.distance, config.syncInterval, settings.isOfflineMode)} · ${t(config.costKey)}`
  }

  const thresholdShown = `${metersToInput(settings.accuracyThreshold)} ${unit}`
  const filterHint = settings.filterInaccurateLocations
    ? t("trackingSync.filter.on", { threshold: thresholdShown })
    : t("trackingSync.filter.off", { threshold: thresholdShown })

  const ssidTyped = settings.syncSsid
  const offerCurrentSsid = currentSsid !== "" && currentSsid.toLowerCase() !== ssidTyped.toLowerCase()

  return (
    <View>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("trackingSync.intro")}</Text>

      <SectionTitle>{t("trackingSync.section.recording")}</SectionTitle>
      <Card rows>
        {activeProfile && (
          <>
            <StateLine
              icon={UserRoundPen}
              iconColor={colors.textSecondary}
              label={t("trackingSync.profileActive", { name: activeProfile.name })}
              caption={t("trackingSync.inForce", { clause: recordingPhrase(activeProfile) })}
              testID="profile-override-recording"
            />
            <Divider tight />
          </>
        )}
        <View accessibilityRole="radiogroup" style={!activeProfile && styles.group}>
          {(Object.keys(TRACKING_PRESETS) as SelectablePreset[]).map((preset) => (
            <RadioRow
              key={preset}
              testID={`preset-${preset}`}
              label={t(TRACKING_PRESETS[preset].labelKey)}
              sub={presetSub(preset)}
              selected={settings.syncPreset === preset}
              onPress={() => handlePresetSelect(preset)}
            />
          ))}
          <RadioRow
            testID="preset-custom"
            label={t("common.custom")}
            sub={
              isCustomPreset
                ? trackingSummary(settings.interval, settings.distance, settings.syncInterval, settings.isOfflineMode)
                : t("trackingSync.custom.sub")
            }
            selected={isCustomPreset}
            onPress={handleCustomSelect}
          />

          {isCustomPreset && (
            <View style={styles.reveal}>
              <NumericInput
                label={t("trackingSync.interval")}
                value={intervalInput}
                onChange={(val) => handleNumericChange("interval", val)}
                onBlur={() => handleNumericBlur("interval")}
                unit={t("unit.s")}
                placeholder="30"
                hint={t("trackingSync.interval.hint")}
                error={wholeNumberError(intervalInput, NUMERIC_MIN.interval, t("unit.s"))}
                message={clampNote("interval")}
              />

              <NumericInput
                label={t("trackingSync.distance")}
                value={distanceInput}
                onChange={(val) => handleNumericChange("distance", val)}
                onBlur={() => handleNumericBlur("distance")}
                unit={unit}
                placeholder="2"
                hint={t("trackingSync.distance.hint")}
                error={wholeNumberError(distanceInput, NUMERIC_MIN.distance, unit)}
                message={clampNote("distance")}
              />
            </View>
          )}
        </View>
      </Card>

      {!settings.isOfflineMode && (
        <>
          <SectionTitle style={styles.groupTop}>{t("trackingSync.section.syncInterval")}</SectionTitle>
          <Card rows>
            {activeProfile && (
              <>
                <StateLine
                  icon={UserRoundPen}
                  iconColor={colors.textSecondary}
                  label={t("trackingSync.profileActive", { name: activeProfile.name })}
                  caption={t("trackingSync.inForce", { clause: syncSummary(activeProfile.syncInterval) })}
                  testID="profile-override-sync"
                />
                <Divider tight />
              </>
            )}
            <SyncIntervalPicker
              pullUp={!activeProfile}
              value={settings.syncInterval}
              onSelect={(seconds) => handleSyncIntervalChange(seconds, onImmediateSave)}
              onChange={(seconds) => handleSyncIntervalChange(seconds, onDebouncedSave)}
              onClamp={(seconds) => handleSyncIntervalChange(seconds, onImmediateSave)}
            />

            {showOverlandBatchSize && (
              <>
                <Divider tight />
                <View style={styles.batch}>
                  <NumericInput
                    label={t("trackingSync.batch")}
                    value={overlandBatchSizeInput}
                    onChange={handleBatchChange}
                    onBlur={handleBatchBlur}
                    unit={t("unit.points")}
                    placeholder="50"
                    hint={t("trackingSync.batch.hint", { min: OVERLAND_BATCH_MIN, max: OVERLAND_BATCH_MAX })}
                    error={batchError}
                    message={clampNote("batch")}
                  />
                </View>
              </>
            )}
          </Card>

          <SectionTitle style={styles.groupTop}>{t("trackingSync.section.syncOn")}</SectionTitle>
          <Card rows>
            <View accessibilityRole="radiogroup" style={styles.group}>
              {SYNC_CONDITION_OPTIONS.map(({ value, labelKey, subKey }) => (
                <React.Fragment key={value}>
                  <RadioRow
                    testID={`sync-condition-${value}`}
                    label={t(labelKey)}
                    sub={t(subKey)}
                    selected={settings.syncCondition === value}
                    onPress={() => {
                      const next = { ...settings, syncCondition: value }
                      onSettingsChange(next)
                      onImmediateSave(next)
                    }}
                  />
                  {/* Belongs to its own row, not to the end of the group: VPN sits below it. */}
                  {value === "wifi_ssid" && settings.syncCondition === "wifi_ssid" && (
                    <View style={[styles.reveal, offerCurrentSsid ? styles.revealButtonTail : styles.revealTail]}>
                      <TextField
                        label={t("trackingSync.ssid")}
                        testID="sync-ssid-input"
                        mono
                        value={ssidTyped}
                        onChangeText={(text) => {
                          const next = { ...settings, syncSsid: text }
                          onSettingsChange(next)
                          onDebouncedSave(next)
                        }}
                        placeholder={t("trackingSync.ssid.placeholder")}
                        autoCapitalize="none"
                        autoCorrect={false}
                        error={ssidTyped.trim() === "" ? t("trackingSync.ssid.empty") : undefined}
                      />
                      {offerCurrentSsid && (
                        <Button
                          variant="secondary"
                          title={t("trackingSync.ssid.use", { ssid: currentSsid })}
                          testID="sync-ssid-use"
                          onPress={() => {
                            const next = { ...settings, syncSsid: currentSsid }
                            onSettingsChange(next)
                            onImmediateSave(next)
                          }}
                        />
                      )}
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>
          </Card>
        </>
      )}

      <SectionTitle style={styles.groupTop}>{t("trackingSync.section.accuracy")}</SectionTitle>
      <Card rows>
        <SettingRow label={t("trackingSync.filter")} hint={filterHint}>
          <Toggle
            accessibilityLabel={t("trackingSync.filter")}
            value={settings.filterInaccurateLocations}
            onValueChange={(value) => {
              const next = { ...settings, filterInaccurateLocations: value }
              onSettingsChange(next)
              onImmediateSave(next)
            }}
          />
        </SettingRow>

        {settings.filterInaccurateLocations && (
          <View style={styles.filterField}>
            <NumericInput
              label={t("trackingSync.threshold")}
              value={accuracyThresholdInput}
              onChange={(val) => handleNumericChange("accuracyThreshold", val)}
              onBlur={() => handleNumericBlur("accuracyThreshold")}
              unit={unit}
              placeholder="50"
              hint={t("trackingSync.threshold.hint", { unit })}
              error={wholeNumberError(accuracyThresholdInput, NUMERIC_MIN.accuracyThreshold, unit)}
              message={clampNote("accuracyThreshold")}
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
  group: {
    marginTop: -space.sm
  },
  groupTop: {
    marginTop: space.xl
  },
  // The row above already pays space.lg below it; the field's own bottom margin is the card's tail.
  reveal: {
    paddingLeft: size.iconColumn,
    marginTop: -space.xs
  },
  revealTail: {
    paddingBottom: space.lg
  },
  // Button bakes marginVertical space.sm, which completes the 16 to the next row.
  revealButtonTail: {
    paddingBottom: space.sm
  },
  batch: {
    paddingTop: space.lg
  },
  filterField: {
    marginTop: -space.xs
  }
})
