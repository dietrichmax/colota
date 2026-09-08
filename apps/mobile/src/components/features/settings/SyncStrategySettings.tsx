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
import { recordingSummary, syncSummary, trackingSummary } from "../../../utils/dashboardState"
import { parseWholeNumber, wholeNumberError } from "../../../utils/settingsValidation"
import { isOverlandFormat } from "../../../utils/apiPayload"
import NativeLocationService from "../../../services/NativeLocationService"

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

const SYNC_CONDITION_OPTIONS: { value: SyncCondition; label: string; sub: string }[] = [
  {
    value: "any",
    label: "Any network",
    sub: "Mobile data and Wi-Fi · syncs never wait, counts against your data plan"
  },
  { value: "wifi_any", label: "Wi-Fi or Ethernet", sub: "Unmetered networks only · fixes wait on mobile data" },
  { value: "wifi_ssid", label: "Specific Wi-Fi network", sub: "One network by name · fixes wait elsewhere" },
  { value: "vpn", label: "VPN", sub: "Only while a VPN is up · fixes wait otherwise" }
]

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

export function SyncStrategySettings({
  settings,
  onSettingsChange,
  onDebouncedSave,
  onImmediateSave,
  activeProfile = null
}: SyncStrategySettingsProps) {
  const { colors } = useTheme()
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
    noteClamp(key, `Set to ${min} ${key === "interval" ? "s" : unit}`)
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
    noteClamp("batch", `Set to ${clamped} points`)
    const next = { ...settings, overlandBatchSize: clamped }
    onSettingsChange(next)
    onImmediateSave(next)
  }

  const batchError = (() => {
    if (overlandBatchSizeInput === "") return undefined
    const num = parseWholeNumber(overlandBatchSizeInput)
    if (num === null) return "A whole number"
    if (num < OVERLAND_BATCH_MIN || num > OVERLAND_BATCH_MAX) return `${OVERLAND_BATCH_MIN} to ${OVERLAND_BATCH_MAX}`
    return undefined
  })()

  const presetSub = (preset: SelectablePreset) => {
    const config = TRACKING_PRESETS[preset]
    return `${trackingSummary(config.interval, config.distance, config.syncInterval, settings.isOfflineMode)} · ${config.cost}`
  }

  const thresholdShown = `${metersToInput(settings.accuracyThreshold)} ${unit}`
  const filterHint = settings.filterInaccurateLocations
    ? `Drops fixes the chip rates worse than ${thresholdShown}. Stricter leaves gaps indoors.`
    : `Every fix is kept. When on, fixes worse than ${thresholdShown} are dropped.`

  const ssidTyped = settings.syncSsid
  const offerCurrentSsid = currentSsid !== "" && currentSsid.toLowerCase() !== ssidTyped.toLowerCase()

  return (
    <View>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        How often a fix is recorded and when it syncs. Changes apply at once and restart tracking.
      </Text>

      <SectionTitle>Recording</SectionTitle>
      <Card rows>
        {activeProfile && (
          <>
            <StateLine
              icon={UserRoundPen}
              iconColor={colors.textSecondary}
              label={`${activeProfile.name} is active`}
              caption={`In force: ${lowerFirst(recordingSummary(activeProfile.interval, activeProfile.distance))}`}
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
              label={TRACKING_PRESETS[preset].label}
              sub={presetSub(preset)}
              selected={settings.syncPreset === preset}
              onPress={() => handlePresetSelect(preset)}
            />
          ))}
          <RadioRow
            testID="preset-custom"
            label="Custom"
            sub={
              isCustomPreset
                ? trackingSummary(settings.interval, settings.distance, settings.syncInterval, settings.isOfflineMode)
                : "Your own interval and movement threshold"
            }
            selected={isCustomPreset}
            onPress={handleCustomSelect}
          />

          {isCustomPreset && (
            <View style={styles.reveal}>
              <NumericInput
                label="Interval"
                value={intervalInput}
                onChange={(val) => handleNumericChange("interval", val)}
                onBlur={() => handleNumericBlur("interval")}
                unit="s"
                placeholder="30"
                hint="At least 1 s. Shorter keeps the GPS awake more of the time and records more points."
                error={wholeNumberError(intervalInput, NUMERIC_MIN.interval, "s")}
                message={clampNote("interval")}
              />

              <NumericInput
                label="Movement threshold"
                value={distanceInput}
                onChange={(val) => handleNumericChange("distance", val)}
                onBlur={() => handleNumericBlur("distance")}
                unit={unit}
                placeholder="2"
                hint="0 keeps every fix. Both the interval and this distance must pass before a fix is kept; higher saves storage and sync data, not battery. Not applied in a pause zone or by a stationary profile."
                error={wholeNumberError(distanceInput, NUMERIC_MIN.distance, unit)}
                message={clampNote("distance")}
              />
            </View>
          )}
        </View>
      </Card>

      {!settings.isOfflineMode && (
        <>
          <SectionTitle style={styles.groupTop}>Sync interval</SectionTitle>
          <Card rows>
            {activeProfile && (
              <>
                <StateLine
                  icon={UserRoundPen}
                  iconColor={colors.textSecondary}
                  label={`${activeProfile.name} is active`}
                  caption={`In force: ${syncSummary(activeProfile.syncInterval)}`}
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
                    label="Batch size"
                    value={overlandBatchSizeInput}
                    onChange={handleBatchChange}
                    onBlur={handleBatchBlur}
                    unit="points"
                    placeholder="50"
                    hint={`${OVERLAND_BATCH_MIN} to ${OVERLAND_BATCH_MAX} points per request. Larger means fewer requests and bigger payloads.`}
                    error={batchError}
                    message={clampNote("batch")}
                  />
                </View>
              </>
            )}
          </Card>

          <SectionTitle style={styles.groupTop}>Sync only on</SectionTitle>
          <Card rows>
            <View accessibilityRole="radiogroup" style={styles.group}>
              {SYNC_CONDITION_OPTIONS.map(({ value, label, sub }) => (
                <React.Fragment key={value}>
                  <RadioRow
                    testID={`sync-condition-${value}`}
                    label={label}
                    sub={sub}
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
                        label="Network name"
                        testID="sync-ssid-input"
                        mono
                        value={ssidTyped}
                        onChangeText={(text) => {
                          const next = { ...settings, syncSsid: text }
                          onSettingsChange(next)
                          onDebouncedSave(next)
                        }}
                        placeholder="As shown in Wi-Fi settings"
                        autoCapitalize="none"
                        autoCorrect={false}
                        error={ssidTyped.trim() === "" ? "Nothing syncs until a network is named" : undefined}
                      />
                      {offerCurrentSsid && (
                        <Button
                          variant="secondary"
                          title={`Use ${currentSsid}`}
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

      <SectionTitle style={styles.groupTop}>Accuracy filter</SectionTitle>
      <Card rows>
        <SettingRow label="Filter inaccurate locations" hint={filterHint}>
          <Toggle
            accessibilityLabel="Filter inaccurate locations"
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
              label="Accuracy threshold"
              value={accuracyThresholdInput}
              onChange={(val) => handleNumericChange("accuracyThreshold", val)}
              onBlur={() => handleNumericBlur("accuracyThreshold")}
              unit={unit}
              placeholder="50"
              hint={`At least 1 ${unit}. The chip's own estimate, often optimistic; lower drops more fixes.`}
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
