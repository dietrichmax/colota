/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useLayoutEffect } from "react"
import { View, Text, StyleSheet, ScrollView } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { useTranslation } from "../i18n/useTranslation"
import { ProfileService } from "../services/ProfileService"
import { showAlert, showConfirm } from "../services/modalService"
import { TrackingProfile, ProfileConditionType } from "../types/global"
import { text } from "../styles/typography"
import {
  Button,
  Container,
  Divider,
  FieldMessage,
  NumericInput,
  RadioRow,
  SectionTitle,
  SettingRow,
  TextField
} from "../components"
import { logger } from "../utils/logger"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../utils/geo"
import {
  size,
  space,
  MS_TO_KMH,
  PROFILE_CONDITIONS,
  SYNC_INTERVAL_PRESETS,
  SYNC_INTERVAL_LABELS,
  STATIONARY_MAX_INTERVAL_SECONDS,
  defaultProfileDelays
} from "../constants"
import type { RootScreenProps } from "../types/navigation"

const CUSTOM_SYNC_INTERVAL_SECONDS = 1800

// The sticky footer floats over the list, so the scroll content ends above it.
const FOOTER_HEIGHT = size.touch + space.lg * 2

function formatSyncDefault(seconds: number): string {
  if (SYNC_INTERVAL_LABELS[seconds]) return SYNC_INTERVAL_LABELS[seconds]
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)} min`
}

export function ProfileEditorScreen({ navigation, route }: RootScreenProps<"Profile Editor">) {
  const { colors } = useTheme()
  const { t } = useTranslation()
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

  // headerTitle, not title: SCREEN_CONFIG sets headerTitle and native-stack prefers it.
  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: isEditing ? t("profileEditor.edit") : t("profileEditor.new") })
  }, [navigation, isEditing, t])

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
        showAlert(t("profileEditor.error"), t("profileEditor.error.load"), "error")
        navigation.goBack()
      })
  }, [profileId, navigation, t])

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
      showAlert(t("profileEditor.missingName"), t("profileEditor.missingName.message"), "warning")
      return
    }
    if (profile.interval < 1) {
      showAlert(t("profileEditor.invalidInterval"), t("profileEditor.invalidInterval.message"), "warning")
      return
    }
    const isSpeedCondition = profile.condition.type === "speed_above" || profile.condition.type === "speed_below"
    if (isSpeedCondition && (!profile.condition.speedThreshold || profile.condition.speedThreshold <= 0)) {
      showAlert(t("profileEditor.missingSpeed"), t("profileEditor.missingSpeed.message"), "warning")
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
      showAlert(t("profileEditor.error"), t("profileEditor.error.save"), "error")
    } finally {
      setSaving(false)
    }
  }, [profile, isEditing, profileId, navigation, t])

  const handleDelete = useCallback(async () => {
    if (!profileId) return
    const confirmed = await showConfirm({
      title: t("profileEditor.delete.title"),
      message: t("profileEditor.delete.message", { name: profile.name }),
      confirmText: t("profileEditor.delete.confirm"),
      destructive: true
    })
    if (!confirmed) return

    try {
      await ProfileService.deleteProfile(profileId)
      navigation.goBack()
    } catch (err) {
      logger.error("[ProfileEditor] Delete failed:", err)
      showAlert(t("profileEditor.error"), t("profileEditor.error.delete"), "error")
    }
  }, [profileId, profile.name, navigation, t])

  const isStationary = profile.condition.type === "stationary"
  const isCustomSyncInterval = !SYNC_INTERVAL_PRESETS.includes(profile.syncInterval)

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle first>{t("profileEditor.profile")}</SectionTitle>

        <TextField
          label={t("profileEditor.name")}
          placeholder={t("profileEditor.name.placeholder")}
          value={profile.name}
          onChangeText={(val) => setProfile((prev) => ({ ...prev, name: val }))}
        />

        <SettingRow label={t("profileEditor.priority")} hint={t("profileEditor.priority.hint")}>
          <TextField
            figure
            accessibilityLabel={t("profileEditor.priority")}
            keyboardType="numeric"
            value={priorityStr}
            onChangeText={(val) => handleNumericChange(setPriorityStr, "priority", val, 0)}
            placeholder="10"
            containerStyle={styles.numberField}
          />
        </SettingRow>

        <SectionTitle>{t("profileEditor.activatesWhen")}</SectionTitle>

        <View accessibilityRole="radiogroup">
          {PROFILE_CONDITIONS.map((opt, index) => {
            const selected = profile.condition.type === opt.type
            const isSpeedOption = opt.type === "speed_above" || opt.type === "speed_below"
            return (
              <View key={opt.type}>
                {index > 0 && <Divider tight inset={size.iconColumn} />}
                <RadioRow
                  icon={opt.icon}
                  label={opt.label}
                  caption={opt.description}
                  selected={selected}
                  onPress={() => setConditionType(opt.type)}
                />
                {selected && isSpeedOption && (
                  <View style={styles.indented}>
                    <TextField
                      label={t("profileEditor.speedThreshold")}
                      figure
                      keyboardType="numeric"
                      placeholder="30"
                      value={speedKmh}
                      onChangeText={handleSpeedChange}
                      containerStyle={styles.numberField}
                    />
                  </View>
                )}
              </View>
            )
          })}
        </View>

        <SectionTitle>{t("profileEditor.tracking")}</SectionTitle>

        <NumericInput
          label={t("profileEditor.interval")}
          hint={t("profileEditor.interval.hint", { seconds: settings.interval })}
          value={intervalStr}
          onChange={(val) => handleNumericChange(setIntervalStr, "interval", val, 1)}
          onBlur={() => {}}
          unit={t("profileEditor.unit.seconds")}
          placeholder="5"
        />

        {isStationary && profile.interval > STATIONARY_MAX_INTERVAL_SECONDS && (
          <FieldMessage variant="warning">
            {t("profileEditor.stationaryIntervalWarning", { minutes: Math.floor(profile.interval / 60) })}
          </FieldMessage>
        )}

        <Divider tight />

        {isStationary ? (
          <FieldMessage>{t("profileEditor.stationaryDistanceNote")}</FieldMessage>
        ) : (
          <NumericInput
            label={t("profileEditor.movementThreshold")}
            hint={t("profileEditor.movementThreshold.hint", {
              distance: metersToInput(settings.distance),
              unit: shortDistanceUnit()
            })}
            value={distanceStr}
            onChange={(val) => handleNumericChange(setDistanceStr, "distance", val, 0)}
            onBlur={() => {}}
            unit={shortDistanceUnit()}
            placeholder="0"
          />
        )}

        {!settings.isOfflineMode && (
          <>
            <SectionTitle>{t("profileEditor.syncInterval")}</SectionTitle>
            <Text style={[styles.groupHint, { color: colors.textSecondary }]}>
              {t("profileEditor.syncInterval.hint", { value: formatSyncDefault(settings.syncInterval) })}
            </Text>

            <View accessibilityRole="radiogroup">
              {SYNC_INTERVAL_PRESETS.map((sec) => (
                <View key={sec}>
                  <RadioRow
                    label={SYNC_INTERVAL_LABELS[sec]}
                    selected={profile.syncInterval === sec && !isCustomSyncInterval}
                    onPress={() => setProfile((prev) => ({ ...prev, syncInterval: sec }))}
                  />
                  <Divider tight />
                </View>
              ))}
              <RadioRow
                label={t("profileEditor.custom")}
                selected={isCustomSyncInterval}
                onPress={() => {
                  if (!isCustomSyncInterval) {
                    setSyncIntervalStr(CUSTOM_SYNC_INTERVAL_SECONDS.toString())
                    setProfile((prev) => ({ ...prev, syncInterval: CUSTOM_SYNC_INTERVAL_SECONDS }))
                  }
                }}
              />
            </View>

            {isCustomSyncInterval && (
              <View style={styles.indented}>
                <NumericInput
                  label={t("profileEditor.customInterval")}
                  hint={t("profileEditor.customInterval.hint")}
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
                  unit={t("profileEditor.unit.seconds")}
                  placeholder="1800"
                />
              </View>
            )}
          </>
        )}

        <SectionTitle>{t("profileEditor.switching")}</SectionTitle>

        <NumericInput
          label={t("profileEditor.activationDelay")}
          hint={
            isStationary ? t("profileEditor.activationDelay.stationaryHint") : t("profileEditor.activationDelay.hint")
          }
          value={activationDelayStr}
          onChange={(val) => handleNumericChange(setActivationDelayStr, "activationDelay", val, 0)}
          onBlur={() => {}}
          unit={t("profileEditor.unit.seconds")}
          placeholder={isStationary ? "60" : "0"}
        />

        {!isStationary && (
          <>
            <Divider tight />
            <NumericInput
              label={t("profileEditor.deactivationDelay")}
              hint={t("profileEditor.deactivationDelay.hint")}
              value={delayStr}
              onChange={(val) => handleNumericChange(setDelayStr, "deactivationDelay", val, 0)}
              onBlur={() => {}}
              unit={t("profileEditor.unit.seconds")}
              placeholder="60"
            />
          </>
        )}

        {isEditing && (
          <View style={styles.destructive}>
            <Divider tight inset={space.lg} />
            <Button
              testID="delete-profile-btn"
              title={t("profileEditor.delete")}
              variant="dangerGhost"
              align="start"
              onPress={handleDelete}
            />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        <Divider tight />
        <View style={styles.footerInner}>
          <Button testID="save-profile-btn" title={t("profileEditor.save")} loading={saving} onPress={handleSave} />
        </View>
      </View>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: FOOTER_HEIGHT + space.xxl
  },
  numberField: {
    width: 72
  },
  // A field that belongs to the row above it starts at that row's text column.
  indented: {
    marginStart: size.iconColumn,
    paddingBottom: space.md
  },
  groupHint: {
    ...text.label,
    marginBottom: space.sm
  },
  destructive: {
    marginTop: space.xxl
  },
  footer: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0
  },
  footerInner: {
    padding: space.lg
  }
})
