/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useLayoutEffect, useCallback } from "react"
import { View, Text, StyleSheet, ScrollView } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { useTimeout } from "../hooks/useTimeout"
import { ProfileService } from "../services/ProfileService"
import { showAlert, showConfirm } from "../services/modalService"
import { TrackingProfile, ProfileConditionType } from "../types/global"
import { fontSizes, fonts, lineHeights } from "../styles/typography"
import { SyncIntervalPicker } from "../components/features/settings/SyncIntervalPicker"
import {
  Button,
  Card,
  Container,
  Divider,
  FieldMessage,
  NumericInput,
  RadioRow,
  SectionTitle,
  SettingRow,
  TextField
} from "../components"
import { Check, Trash2 } from "lucide-react-native"
import { logger } from "../utils/logger"
import { shortDistanceUnit, inputToMeters, metersToInput, getSpeedUnit, speedToInput, inputToSpeed } from "../utils/geo"
import { formatDuration } from "../utils/dashboardState"
import { conditionOf, profileSentence } from "../utils/profileRow"
import { parseWholeNumber, wholeNumberError } from "../utils/settingsValidation"
import {
  PROFILE_CONDITIONS,
  SAVE_SUCCESS_DISPLAY_MS,
  SYNC_INTERVAL_LABELS,
  STATIONARY_MAX_INTERVAL_SECONDS,
  defaultProfileDelays,
  size,
  space
} from "../constants"
import type { RootScreenProps } from "../types/navigation"

type Draft = Omit<TrackingProfile, "id" | "createdAt">
type NumericKey = "interval" | "distance" | "activationDelay" | "deactivationDelay" | "speed"

const DEFAULT_SPEED_INPUT = 30
const DEFAULT_PRIORITY = 10

const isSpeedType = (type: ProfileConditionType) => type === "speed_above" || type === "speed_below"

export function ProfileEditorScreen({ navigation, route }: RootScreenProps<"Profile Editor">) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const profileId = route?.params?.profileId as number | undefined
  const isEditing = !!profileId
  const distanceUnit = shortDistanceUnit()
  const speedUnit = getSpeedUnit().unit

  const [profile, setProfile] = useState<Draft>({
    name: "",
    interval: settings.interval,
    distance: settings.distance,
    syncInterval: settings.syncInterval,
    priority: DEFAULT_PRIORITY,
    condition: { type: "charging" },
    ...defaultProfileDelays("charging"),
    enabled: true
  })
  const [saving, setSaving] = useState(false)
  const [text, setText] = useState({
    interval: String(settings.interval),
    distance: String(metersToInput(settings.distance)),
    speed: String(DEFAULT_SPEED_INPUT),
    priority: String(DEFAULT_PRIORITY),
    activationDelay: String(defaultProfileDelays("charging").activationDelay),
    deactivationDelay: String(defaultProfileDelays("charging").deactivationDelay)
  })
  const [note, setNote] = useState<{ key: NumericKey; text: string } | null>(null)
  const noteTimer = useTimeout()

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: isEditing ? "Edit profile" : "New profile" })
  }, [navigation, isEditing])

  useEffect(() => {
    if (!profileId) return
    ProfileService.getProfiles()
      .then((profiles) => {
        const existing = profiles.find((p) => p.id === profileId)
        if (!existing) return
        setProfile({
          name: existing.name,
          interval: existing.interval,
          distance: existing.distance,
          syncInterval: existing.syncInterval,
          priority: existing.priority,
          condition: existing.condition,
          activationDelay: existing.activationDelay,
          deactivationDelay: existing.deactivationDelay,
          enabled: existing.enabled
        })
        setText({
          interval: String(existing.interval),
          distance: String(metersToInput(existing.distance)),
          speed: String(
            existing.condition.speedThreshold ? speedToInput(existing.condition.speedThreshold) : DEFAULT_SPEED_INPUT
          ),
          priority: String(existing.priority),
          activationDelay: String(existing.activationDelay),
          deactivationDelay: String(existing.deactivationDelay)
        })
      })
      .catch((err) => {
        logger.error("[ProfileEditor] Failed to load profile:", err)
        showAlert("Error", "Failed to load profile data.", "error")
        navigation.goBack()
      })
  }, [profileId, navigation])

  const type = profile.condition.type
  const isSpeed = isSpeedType(type)
  const isStationary = type === "stationary"
  const conditionLabel = conditionOf(profile).label

  const store = useCallback((key: NumericKey, value: number) => {
    setProfile((prev) => {
      if (key === "speed") return { ...prev, condition: { ...prev.condition, speedThreshold: inputToSpeed(value) } }
      if (key === "distance") return { ...prev, distance: inputToMeters(value) }
      return { ...prev, [key]: value }
    })
  }, [])

  const minOf = (key: NumericKey) => (key === "interval" || key === "speed" ? 1 : 0)
  const unitOf = (key: NumericKey) => (key === "distance" ? distanceUnit : key === "speed" ? speedUnit : "s")

  const handleNumeric = (key: NumericKey, value: string) => {
    setText((prev) => ({ ...prev, [key]: value }))
    setNote(null)
    const num = parseWholeNumber(value)
    if (num !== null && num >= minOf(key)) store(key, num)
  }

  // An empty or below-minimum box clamps to the minimum on blur and says so, the Tracking & sync rule.
  const handleBlur = (key: NumericKey) => {
    const min = minOf(key)
    const num = parseWholeNumber(text[key])
    if (num !== null && num >= min) return
    setText((prev) => ({ ...prev, [key]: String(min) }))
    setNote({ key, text: `Set to ${min} ${unitOf(key)}` })
    noteTimer.set(() => setNote(null), SAVE_SUCCESS_DISPLAY_MS)
    store(key, min)
  }

  const errorOf = (key: NumericKey) => wholeNumberError(text[key], minOf(key), unitOf(key))
  const noteOf = (key: NumericKey) => (note?.key === key ? note.text : undefined)

  const priorityError = text.priority !== "" && parseWholeNumber(text.priority) === null ? "A whole number" : undefined
  const handlePriority = (value: string) => {
    setText((prev) => ({ ...prev, priority: value }))
    const num = parseWholeNumber(value)
    if (num !== null) setProfile((prev) => ({ ...prev, priority: num }))
  }
  const handlePriorityBlur = () => {
    if (parseWholeNumber(text.priority) === null) setText((prev) => ({ ...prev, priority: String(profile.priority) }))
  }

  const setConditionType = (next: ProfileConditionType) => {
    if (next === type) return
    const previousDefaults = defaultProfileDelays(type)
    const nextDefaults = defaultProfileDelays(next)
    const keepDelays =
      profile.activationDelay !== previousDefaults.activationDelay ||
      profile.deactivationDelay !== previousDefaults.deactivationDelay
    const delays = keepDelays
      ? { activationDelay: profile.activationDelay, deactivationDelay: profile.deactivationDelay }
      : nextDefaults
    const speedThreshold = isSpeedType(next)
      ? (profile.condition.speedThreshold ?? inputToSpeed(parseWholeNumber(text.speed) ?? DEFAULT_SPEED_INPUT))
      : undefined
    setProfile((prev) => ({
      ...prev,
      ...delays,
      // A distance filter is ignored for a stationary profile; store 0 so UI, DB and runtime agree.
      distance: next === "stationary" ? 0 : prev.distance,
      condition: { type: next, ...(speedThreshold !== undefined ? { speedThreshold } : {}) }
    }))
    setText((prev) => ({
      ...prev,
      distance: next === "stationary" ? "0" : prev.distance,
      activationDelay: String(delays.activationDelay),
      deactivationDelay: String(delays.deactivationDelay),
      speed: speedThreshold !== undefined ? String(speedToInput(speedThreshold)) : prev.speed
    }))
  }

  const handleDelete = useCallback(async () => {
    if (!profileId) return
    const confirmed = await showConfirm({
      title: "Delete profile",
      message: `Delete "${profile.name || conditionLabel}"?`,
      confirmText: "Delete",
      destructive: true
    })
    if (!confirmed) return
    try {
      await ProfileService.deleteProfile(profileId)
      navigation.goBack()
    } catch (err) {
      logger.error("[ProfileEditor] Delete failed:", err)
      showAlert("Error", "Failed to delete profile.", "error")
    }
  }, [profileId, profile.name, conditionLabel, navigation])

  const hasFieldError =
    !!priorityError ||
    !!errorOf("interval") ||
    (!isStationary && !!errorOf("distance")) ||
    (isSpeed && !!errorOf("speed")) ||
    !!errorOf("activationDelay") ||
    (!isStationary && !!errorOf("deactivationDelay"))

  const handleSave = useCallback(async () => {
    const next: Draft = { ...profile, name: profile.name.trim() || conditionLabel }
    setSaving(true)
    try {
      if (isEditing && profileId) {
        await ProfileService.updateProfile({ id: profileId, ...next })
      } else {
        await ProfileService.createProfile(next)
      }
      navigation.goBack()
    } catch (err) {
      logger.error("[ProfileEditor] Save failed:", err)
      showAlert("Error", "Failed to save profile.", "error")
    } finally {
      setSaving(false)
    }
  }, [profile, conditionLabel, isEditing, profileId, navigation])

  const syncDefault = SYNC_INTERVAL_LABELS[settings.syncInterval] ?? formatDuration(settings.syncInterval)

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]} testID="profile-sentence">
          {profileSentence(profile, settings.isOfflineMode)}
        </Text>

        <SectionTitle>Condition</SectionTitle>
        <Card rows>
          <View accessibilityRole="radiogroup" style={styles.group}>
            {PROFILE_CONDITIONS.map((opt) => (
              <React.Fragment key={opt.type}>
                <RadioRow
                  testID={`condition-${opt.type}`}
                  icon={opt.icon}
                  label={opt.label}
                  sub={opt.description}
                  selected={type === opt.type}
                  onPress={() => setConditionType(opt.type)}
                />
                {isSpeedType(opt.type) && type === opt.type && (
                  <View style={styles.reveal}>
                    <NumericInput
                      label="Speed"
                      testID="speed-input"
                      value={text.speed}
                      onChange={(v) => handleNumeric("speed", v)}
                      onBlur={() => handleBlur("speed")}
                      unit={speedUnit}
                      placeholder={String(DEFAULT_SPEED_INPUT)}
                      hint={`At least 1 ${speedUnit}. Applies while your average speed is ${opt.type === "speed_above" ? "above" : "below"} it.`}
                      error={errorOf("speed")}
                      message={noteOf("speed")}
                    />
                  </View>
                )}
              </React.Fragment>
            ))}
          </View>
        </Card>

        <SectionTitle style={styles.groupTop}>Profile</SectionTitle>
        <Card rows style={styles.cardTop}>
          <View style={styles.field}>
            <TextField
              testID="name-input"
              label="Name"
              placeholder={conditionLabel}
              value={profile.name}
              onChangeText={(val) => setProfile((prev) => ({ ...prev, name: val }))}
            />
            <FieldMessage>Shown on the Dashboard while active. Blank uses the condition&apos;s name.</FieldMessage>
          </View>
          <Divider tight />
          <SettingRow
            label="Priority"
            hint="Higher wins when two profiles match at once. Equal numbers go to the older profile."
          >
            <TextField
              accessibilityLabel="Priority"
              testID="priority-input"
              figure
              style={styles.numInput}
              keyboardType="numeric"
              value={text.priority}
              onChangeText={handlePriority}
              onBlur={handlePriorityBlur}
              placeholder={String(DEFAULT_PRIORITY)}
              error={priorityError}
            />
          </SettingRow>
        </Card>

        <SectionTitle style={styles.groupTop}>Tracking while active</SectionTitle>
        <Card rows style={styles.cardTop}>
          <NumericInput
            label="Tracking interval"
            testID="interval-input"
            value={text.interval}
            onChange={(v) => handleNumeric("interval", v)}
            onBlur={() => handleBlur("interval")}
            unit="s"
            placeholder={String(settings.interval)}
            hint={`At least 1 s. Replaces the ${formatDuration(settings.interval)} from Tracking & sync while this profile is active. Shorter keeps the GPS awake more of the time and records more points.`}
            error={errorOf("interval")}
            message={noteOf("interval")}
          />
          {isStationary && profile.interval > STATIONARY_MAX_INTERVAL_SECONDS && (
            <FieldMessage variant="warning" style={styles.warning}>
              Longer than {STATIONARY_MAX_INTERVAL_SECONDS} s may leave the first {formatDuration(profile.interval)} of
              a trip unrecorded
            </FieldMessage>
          )}
          {isStationary ? (
            <SettingRow
              disabled
              label="Movement threshold"
              hint="Not used while still · a point is recorded every interval"
            >
              <Text style={[styles.figure, { color: colors.textDisabled }]}>0 {distanceUnit}</Text>
            </SettingRow>
          ) : (
            <NumericInput
              label="Movement threshold"
              testID="distance-input"
              value={text.distance}
              onChange={(v) => handleNumeric("distance", v)}
              onBlur={() => handleBlur("distance")}
              unit={distanceUnit}
              placeholder={String(metersToInput(settings.distance))}
              hint={`At least 0 ${distanceUnit}. Replaces the ${metersToInput(settings.distance)} ${distanceUnit} from Tracking & sync. 0 records any movement, larger skips small drift.`}
              error={errorOf("distance")}
              message={noteOf("distance")}
            />
          )}
          {!settings.isOfflineMode && (
            <>
              <Divider tight />
              <View style={styles.pickerTop}>
                <SyncIntervalPicker
                  label="Sync interval"
                  hint={`Replaces the ${syncDefault} from Tracking & sync while this profile is active · shorter means more wake-ups`}
                  value={profile.syncInterval}
                  min={0}
                  pullUp={false}
                  onSelect={(seconds) => setProfile((prev) => ({ ...prev, syncInterval: seconds }))}
                  onChange={(seconds) => setProfile((prev) => ({ ...prev, syncInterval: seconds }))}
                  onClamp={(seconds) => setProfile((prev) => ({ ...prev, syncInterval: seconds }))}
                />
              </View>
            </>
          )}
        </Card>

        <SectionTitle style={styles.groupTop}>Switching</SectionTitle>
        <Card rows style={styles.cardTop}>
          <NumericInput
            label="Activation delay"
            testID="activation-delay-input"
            value={text.activationDelay}
            onChange={(v) => handleNumeric("activationDelay", v)}
            onBlur={() => handleBlur("activationDelay")}
            unit="s"
            placeholder={String(defaultProfileDelays(type).activationDelay)}
            hint={
              isStationary
                ? "At least 0 s. How long every fix must read as still first; 0 switches at the first still fix. Moving again ends the profile at once through the motion sensor."
                : "At least 0 s. How long the condition must hold first. 0 switches at once, longer ignores a brief plug or unplug."
            }
            error={errorOf("activationDelay")}
            message={noteOf("activationDelay")}
          />
          {!isStationary && (
            <NumericInput
              label="Deactivation delay"
              testID="deactivation-delay-input"
              value={text.deactivationDelay}
              onChange={(v) => handleNumeric("deactivationDelay", v)}
              onBlur={() => handleBlur("deactivationDelay")}
              unit="s"
              placeholder={String(defaultProfileDelays(type).deactivationDelay)}
              hint="At least 0 s. How long after the condition ends before Tracking & sync applies again. Longer rides out a brief gap so the profile does not flap."
              error={errorOf("deactivationDelay")}
              message={noteOf("deactivationDelay")}
            />
          )}
        </Card>

        <Button
          testID="save-profile-btn"
          title={isEditing ? "Save changes" : "Create profile"}
          icon={Check}
          loading={saving}
          disabled={hasFieldError}
          onPress={handleSave}
          style={styles.save}
        />
        {isEditing && (
          <Button
            testID="delete-profile-btn"
            title="Delete profile"
            icon={Trash2}
            variant="danger"
            onPress={handleDelete}
          />
        )}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl },
  intro: { fontSize: fontSizes.body, ...fonts.regular, lineHeight: lineHeights.body, marginBottom: space.lg },
  group: { marginTop: -space.sm },
  groupTop: { marginTop: space.xl },
  cardTop: { paddingTop: space.lg },
  // The row above already pays space.lg below it; the field's own bottom margin is the card's tail.
  reveal: { paddingLeft: size.iconColumn, marginTop: -space.xs },
  field: { paddingBottom: space.lg },
  numInput: { width: size.numericField },
  figure: { fontSize: fontSizes.input, ...fonts.medium, fontVariant: ["tabular-nums"] },
  warning: { marginTop: -space.sm, marginBottom: space.lg },
  pickerTop: { paddingTop: space.lg },
  save: { marginTop: space.xl }
})
