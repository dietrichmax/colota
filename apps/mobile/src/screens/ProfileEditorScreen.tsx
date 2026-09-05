/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useLayoutEffect, useCallback } from "react"
import { View, Text, StyleSheet, ScrollView } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { ProfileService } from "../services/ProfileService"
import { showAlert } from "../services/modalService"
import { TrackingProfile, ProfileConditionType } from "../types/global"
import { fontSizes, fonts } from "../styles/typography"
import { Button, Card, ChipGroup, Container, Divider, FieldMessage, NumericInput, RadioRow, SectionTitle, SettingRow, TextField } from "../components"
import { Check } from "lucide-react-native"
import { logger } from "../utils/logger"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../utils/geo"
import { MS_TO_KMH, PROFILE_CONDITIONS, STATIONARY_MAX_INTERVAL_SECONDS, SYNC_INTERVAL_LABELS, SYNC_INTERVAL_PRESETS, defaultProfileDelays, space } from "../constants"
import type { RootScreenProps } from "../types/navigation"
import { radius } from "@colota/shared"

function formatSyncDefault(seconds: number): string {
  if (SYNC_INTERVAL_LABELS[seconds]) return SYNC_INTERVAL_LABELS[seconds]
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)} min`
}

export function ProfileEditorScreen({ navigation, route }: RootScreenProps<"Profile Editor">) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const profileId = route?.params?.profileId as number | undefined
  const isEditing = !!profileId

  const [profile, setProfile] = useState<Omit<TrackingProfile, "id" | "createdAt">>({
    name: "",
    interval: settings.interval,
    distance: settings.distance,
    syncInterval: settings.syncInterval,
    priority: 10,
    condition: { type: "charging" },
    ...defaultProfileDelays("charging"),
    enabled: true
  })
  const [speedKmh, setSpeedKmh] = useState("30")
  const [saving, setSaving] = useState(false)

  // String representations for numeric inputs
  const [intervalStr, setIntervalStr] = useState(String(settings.interval))
  const [distanceStr, setDistanceStr] = useState(String(metersToInput(settings.distance)))
  const [priorityStr, setPriorityStr] = useState("10")
  const [activationDelayStr, setActivationDelayStr] = useState("0")
  const [delayStr, setDelayStr] = useState("60")
  const [syncIntervalStr, setSyncIntervalStr] = useState(String(settings.syncInterval))

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: isEditing ? "Edit profile" : "New profile" })
  }, [navigation, isEditing])

  useEffect(() => {
    if (!profileId) return

    ProfileService.getProfiles()
      .then((profiles) => {
        const existing = profiles.find((p) => p.id === profileId)
        if (existing) {
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
          setIntervalStr(String(existing.interval))
          setDistanceStr(String(metersToInput(existing.distance)))
          setPriorityStr(String(existing.priority))
          setActivationDelayStr(String(existing.activationDelay))
          setDelayStr(String(existing.deactivationDelay))
          setSyncIntervalStr(String(existing.syncInterval))
          if (existing.condition.speedThreshold) {
            setSpeedKmh((existing.condition.speedThreshold * MS_TO_KMH).toFixed(0))
          }
        }
      })
      .catch((err) => {
        logger.error("[ProfileEditor] Failed to load profile:", err)
        showAlert("Error", "Failed to load profile data.", "error")
        navigation.goBack()
      })
  }, [profileId, navigation])

  const handleNumericChange = useCallback(
    (setter: (v: string) => void, field: keyof typeof profile, value: string, min = 0) => {
      setter(value)
      const num = Number(value)
      if (!isNaN(num) && num >= min) {
        const stored = field === "distance" ? inputToMeters(num) : num
        setProfile((prev) => ({ ...prev, [field]: stored }))
      }
    },
    []
  )

  const setConditionType = useCallback(
    (type: ProfileConditionType) => {
      const isSpeed = type === "speed_above" || type === "speed_below"
      const isStationary = type === "stationary"
      const { activationDelay: defaultActivation, deactivationDelay: defaultDeactivation } = defaultProfileDelays(type)
      setProfile((prev) => ({
        ...prev,
        // A distance filter is ignored for a stationary profile; store 0 so UI, DB and runtime agree.
        distance: isStationary ? 0 : prev.distance,
        deactivationDelay: prev.condition.type !== type ? defaultDeactivation : prev.deactivationDelay,
        activationDelay: prev.condition.type !== type ? defaultActivation : prev.activationDelay,
        condition: {
          type,
          ...(isSpeed ? { speedThreshold: Number(speedKmh) / MS_TO_KMH } : {})
        }
      }))
      if (isStationary) setDistanceStr("0")
      if (profile.condition.type !== type) {
        setDelayStr(String(defaultDeactivation))
        setActivationDelayStr(String(defaultActivation))
      }
    },
    [speedKmh, profile.condition.type]
  )

  const handleSpeedChange = useCallback((val: string) => {
    setSpeedKmh(val)
    const num = Number(val)
    if (!isNaN(num) && num > 0) {
      setProfile((prev) => ({
        ...prev,
        condition: { ...prev.condition, speedThreshold: num / MS_TO_KMH }
      }))
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!profile.name.trim()) {
      showAlert("Missing Name", "Please enter a profile name.", "warning")
      return
    }
    if (profile.interval < 1) {
      showAlert("Invalid Interval", "Tracking interval must be at least 1 second.", "warning")
      return
    }
    const isSpeed = profile.condition.type === "speed_above" || profile.condition.type === "speed_below"
    if (isSpeed && (!profile.condition.speedThreshold || profile.condition.speedThreshold <= 0)) {
      showAlert("Missing Speed", "Speed conditions require a positive speed threshold.", "warning")
      return
    }

    setSaving(true)
    try {
      if (isEditing && profileId) {
        await ProfileService.updateProfile({ id: profileId, ...profile })
      } else {
        await ProfileService.createProfile(profile)
      }
      navigation.goBack()
    } catch (err) {
      logger.error("[ProfileEditor] Save failed:", err)
      showAlert("Error", "Failed to save profile.", "error")
    } finally {
      setSaving(false)
    }
  }, [profile, isEditing, profileId, navigation])

  const isSpeed = profile.condition.type === "speed_above" || profile.condition.type === "speed_below"
  const isCustomSyncInterval = !SYNC_INTERVAL_PRESETS.includes(profile.syncInterval)


  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Name & Priority */}
        <SectionTitle>Profile</SectionTitle>
        <Card>
          <View style={styles.inputGroup}>
            <TextField
              testID="profile-name-input"
              label="Name"
              placeholder="e.g. Driving, Cycling..."
              value={profile.name}
              onChangeText={(val) => setProfile((prev) => ({ ...prev, name: val }))}
            />
          </View>

          <Divider />

          <SettingRow label="Priority" hint="Higher number wins when multiple profiles match">
            <TextField
              accessibilityLabel="Priority"
              figure
              style={styles.numInput}
              keyboardType="numeric"
              value={priorityStr}
              onChangeText={(val) => handleNumericChange(setPriorityStr, "priority", val, 0)}
              placeholder="10"
            />
          </SettingRow>
        </Card>

        {/* Condition */}
        <SectionTitle style={styles.sectionGap}>Activation condition</SectionTitle>
        <Card>
          {PROFILE_CONDITIONS.map((opt, i) => (
            <RadioRow
              key={opt.type}
              icon={opt.icon}
              label={opt.label}
              sub={opt.description}
              selected={profile.condition.type === opt.type}
              onPress={() => setConditionType(opt.type)}
              divider={i < PROFILE_CONDITIONS.length - 1}
            />
          ))}

          {isSpeed && (
            <>
              <Divider />
              <View style={styles.inputGroup}>
                <TextField
                  testID="speed-threshold-input"
                  label="Speed Threshold (km/h)"
                  figure
                  placeholder="30"
                  value={speedKmh}
                  onChangeText={handleSpeedChange}
                  keyboardType="numeric"
                />
              </View>
            </>
          )}
        </Card>

        {/* Tracking Settings */}
        <SectionTitle style={styles.sectionGap}>Tracking settings</SectionTitle>
        <Card>
          <SettingRow label="Tracking interval" hint={`Default: ${settings.interval}s`}>
            <View style={styles.inputWithUnit}>
              <TextField
                accessibilityLabel="Tracking interval"
                figure
                style={styles.numInput}
                keyboardType="numeric"
                value={intervalStr}
                onChangeText={(val) => handleNumericChange(setIntervalStr, "interval", val, 1)}
                placeholder="5"
              />
              <Text style={[styles.unit, { color: colors.textSecondary }]}>sec</Text>
            </View>
          </SettingRow>

          {profile.condition.type === "stationary" && profile.interval > STATIONARY_MAX_INTERVAL_SECONDS && (
            <FieldMessage variant="warning">
              The device may miss the first {Math.floor(profile.interval / 60)} minutes of a trip when you start moving
              with the specified interval!
            </FieldMessage>
          )}

          <Divider />

          {profile.condition.type === "stationary" ? (
            <FieldMessage>
              Movement threshold does not apply to a stationary profile - a point is recorded at every interval.
            </FieldMessage>
          ) : (
            <SettingRow
              label="Movement threshold"
              hint={`Default: ${metersToInput(settings.distance)} ${shortDistanceUnit()}`}
            >
              <View style={styles.inputWithUnit}>
                <TextField
                  accessibilityLabel="Movement threshold"
                  figure
                  style={styles.numInput}
                  keyboardType="numeric"
                  value={distanceStr}
                  onChangeText={(val) => handleNumericChange(setDistanceStr, "distance", val, 0)}
                  placeholder="0"
                />
                <Text style={[styles.unit, { color: colors.textSecondary }]}>{shortDistanceUnit()}</Text>
              </View>
            </SettingRow>
          )}

          {!settings.isOfflineMode && (
            <>
              <Divider />

              <View style={styles.syncLabelRow}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Sync interval</Text>
                <Text style={[styles.settingHint, { color: colors.textSecondary }]}>
                  Default: {formatSyncDefault(settings.syncInterval)}
                </Text>
              </View>
              <ChipGroup
                options={[
                  ...SYNC_INTERVAL_PRESETS.map((sec) => ({
                    value: String(sec),
                    label: SYNC_INTERVAL_LABELS[sec]
                  })),
                  { value: "custom", label: "Custom" }
                ]}
                selected={isCustomSyncInterval ? "custom" : String(profile.syncInterval)}
                onSelect={(value) => {
                  if (value === "custom") {
                    // Seeding a value is what makes the mode custom; the field takes over from here.
                    if (!isCustomSyncInterval) {
                      const customValue = 1800
                      setSyncIntervalStr(customValue.toString())
                      setProfile((prev) => ({ ...prev, syncInterval: customValue }))
                    }
                    return
                  }
                  setProfile((prev) => ({ ...prev, syncInterval: Number(value) }))
                }}
              />

              {isCustomSyncInterval && (
                <View style={styles.customSyncInput}>
                  <NumericInput
                    label="Custom sync interval"
                    value={syncIntervalStr}
                    onChange={(val) => {
                      setSyncIntervalStr(val)
                      const num = Number(val)
                      if (!isNaN(num) && num >= 0) {
                        setProfile((prev) => ({ ...prev, syncInterval: num }))
                      }
                    }}
                    onBlur={() => {
                      const num = Number(syncIntervalStr)
                      if (isNaN(num) || num < 0) {
                        setSyncIntervalStr("0")
                        setProfile((prev) => ({ ...prev, syncInterval: 0 }))
                      }
                    }}
                    unit="seconds"
                    placeholder="1800"
                    hint="Custom interval in seconds"
                    colors={colors}
                  />
                </View>
              )}
            </>
          )}
        </Card>

        <SectionTitle style={styles.sectionGap}>Switching</SectionTitle>
        <Card>
          {profile.condition.type === "stationary" ? (
            <SettingRow
              label="Activation delay"
              hint="How long the device must be still before this profile activates. Resumes instantly via the hardware motion sensor when you move again."
            >
              <View style={styles.inputWithUnit}>
                <TextField
                  accessibilityLabel="Activation delay"
                  figure
                  style={styles.numInput}
                  keyboardType="numeric"
                  value={activationDelayStr}
                  onChangeText={(val) => handleNumericChange(setActivationDelayStr, "activationDelay", val, 0)}
                  placeholder="60"
                />
                <Text style={[styles.unit, { color: colors.textSecondary }]}>sec</Text>
              </View>
            </SettingRow>
          ) : (
            <>
              <SettingRow
                label="Activation delay"
                hint="How long the condition must hold before this profile takes over. Avoids switching on brief, temporary changes. 0 = instant."
              >
                <View style={styles.inputWithUnit}>
                  <TextField
                    accessibilityLabel="Activation delay"
                    figure
                    style={styles.numInput}
                    keyboardType="numeric"
                    value={activationDelayStr}
                    onChangeText={(val) => handleNumericChange(setActivationDelayStr, "activationDelay", val, 0)}
                    placeholder="0"
                  />
                  <Text style={[styles.unit, { color: colors.textSecondary }]}>sec</Text>
                </View>
              </SettingRow>

              <Divider />

              <SettingRow
                label="Deactivation delay"
                hint="How long after the condition stops before reverting to your defaults. Prevents rapid back-and-forth switching."
              >
                <View style={styles.inputWithUnit}>
                  <TextField
                    accessibilityLabel="Deactivation delay"
                    figure
                    style={styles.numInput}
                    keyboardType="numeric"
                    value={delayStr}
                    onChangeText={(val) => handleNumericChange(setDelayStr, "deactivationDelay", val, 0)}
                    placeholder="60"
                  />
                  <Text style={[styles.unit, { color: colors.textSecondary }]}>sec</Text>
                </View>
              </SettingRow>
            </>
          )}
        </Card>

        {/* Save Button */}
        <Button
          title={saving ? "Saving…" : isEditing ? "Save changes" : "Create profile"}
          icon={Check}
          loading={saving}
          style={styles.saveBtn}
          onPress={handleSave}
        />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 40 },
  header: { marginBottom: 20 },
  inputGroup: { marginBottom: space.xs },
  label: {
    fontSize: fontSizes.caption,
    ...fonts.semiBold,
    marginBottom: 6
  },
  input: { padding: 14, borderWidth: 1.5, borderRadius: 10, fontSize: fontSizes.input, ...fonts.regular },
  numInput: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    fontSize: fontSizes.input,
    textAlign: "center",
    width: 64,
    ...fonts.regular
  },
  inputWithUnit: { flexDirection: "row", alignItems: "center", gap: 6 },
  unit: { fontSize: fontSizes.body, ...fonts.medium, minWidth: 28 },
  syncLabelRow: { marginBottom: space.sm },
  settingLabel: { fontSize: fontSizes.label, ...fonts.semiBold, marginBottom: 2 },
  settingHint: { fontSize: fontSizes.description, ...fonts.regular, lineHeight: 18 }, // ~3 per row with gap
  customSyncInput: { marginTop: space.md },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    marginTop: space.lg
  },
  sectionGap: { marginTop: space.xl }
})
