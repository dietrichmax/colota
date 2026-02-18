/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback } from "react"
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { ProfileService } from "../services/ProfileService"
import { showAlert } from "../services/modalService"
import { TrackingProfile, ProfileConditionType } from "../types/global"
import { fonts } from "../styles/typography"
import { Container, SectionTitle, Card, Divider } from "../components"
import { Check } from "lucide-react-native"
import { logger } from "../utils/logger"
import { MS_TO_KMH, PROFILE_CONDITIONS } from "../constants"

const SYNC_OPTIONS = [
  { label: "Instant", value: 0 },
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
  { label: "15 min", value: 900 }
]

const DEFAULT_PROFILE: Omit<TrackingProfile, "id" | "createdAt"> = {
  name: "",
  interval: 5,
  distance: 0,
  syncInterval: 0,
  priority: 10,
  condition: { type: "charging" },
  deactivationDelay: 60,
  enabled: true
}

export function ProfileEditorScreen({ navigation, route }: any) {
  const { colors } = useTheme()
  const profileId = route?.params?.profileId as number | undefined
  const isEditing = !!profileId

  const [profile, setProfile] = useState<Omit<TrackingProfile, "id" | "createdAt">>(DEFAULT_PROFILE)
  const [speedKmh, setSpeedKmh] = useState("30")
  const [saving, setSaving] = useState(false)

  // String representations for numeric inputs
  const [intervalStr, setIntervalStr] = useState("5")
  const [distanceStr, setDistanceStr] = useState("0")
  const [priorityStr, setPriorityStr] = useState("10")
  const [delayStr, setDelayStr] = useState("60")

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
            deactivationDelay: existing.deactivationDelay,
            enabled: existing.enabled
          })
          setIntervalStr(String(existing.interval))
          setDistanceStr(String(existing.distance))
          setPriorityStr(String(existing.priority))
          setDelayStr(String(existing.deactivationDelay))
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
        setProfile((prev) => ({ ...prev, [field]: num }))
      }
    },
    []
  )

  const setConditionType = useCallback(
    (type: ProfileConditionType) => {
      const isSpeed = type === "speed_above" || type === "speed_below"
      setProfile((prev) => ({
        ...prev,
        condition: {
          type,
          ...(isSpeed ? { speedThreshold: Number(speedKmh) / MS_TO_KMH } : {})
        }
      }))
    },
    [speedKmh]
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

  const inputStyle = [
    styles.numInput,
    { backgroundColor: colors.backgroundElevated, color: colors.text, borderColor: colors.border }
  ]

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{isEditing ? "Edit Profile" : "New Profile"}</Text>
        </View>

        {/* Name & Priority */}
        <SectionTitle>Profile</SectionTitle>
        <Card>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
              ]}
              placeholder="e.g. Driving, Cycling..."
              placeholderTextColor={colors.placeholder}
              value={profile.name}
              onChangeText={(val) => setProfile((prev) => ({ ...prev, name: val }))}
            />
          </View>

          <Divider />

          <View style={styles.settingRow}>
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Priority</Text>
              <Text style={[styles.settingHint, { color: colors.textLight }]}>
                Higher number wins when multiple profiles match
              </Text>
            </View>
            <TextInput
              style={inputStyle}
              keyboardType="numeric"
              value={priorityStr}
              onChangeText={(val) => handleNumericChange(setPriorityStr, "priority", val, 0)}
              placeholder="10"
              placeholderTextColor={colors.placeholder}
            />
          </View>
        </Card>

        {/* Condition */}
        <SectionTitle style={styles.sectionGap}>Activation Condition</SectionTitle>
        <Card>
          <View style={styles.conditionGrid}>
            {PROFILE_CONDITIONS.map((opt) => {
              const Icon = opt.icon
              const selected = profile.condition.type === opt.type
              return (
                <TouchableOpacity
                  key={opt.type}
                  style={[
                    styles.conditionOption,
                    {
                      backgroundColor: selected ? colors.primary + "15" : colors.background,
                      borderColor: selected ? colors.primary : colors.border
                    }
                  ]}
                  onPress={() => setConditionType(opt.type)}
                  activeOpacity={0.7}
                >
                  <Icon size={20} color={selected ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.conditionLabel, { color: selected ? colors.primary : colors.text }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.conditionDesc, { color: colors.textLight }]}>{opt.description}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {isSpeed && (
            <>
              <Divider />
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Speed Threshold (km/h)</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
                  ]}
                  placeholder="30"
                  placeholderTextColor={colors.placeholder}
                  value={speedKmh}
                  onChangeText={handleSpeedChange}
                  keyboardType="numeric"
                />
              </View>
            </>
          )}
        </Card>

        {/* Tracking Settings */}
        <SectionTitle style={styles.sectionGap}>Tracking Settings</SectionTitle>
        <Card>
          <View style={styles.settingRow}>
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Tracking Interval</Text>
            </View>
            <View style={styles.inputWithUnit}>
              <TextInput
                style={inputStyle}
                keyboardType="numeric"
                value={intervalStr}
                onChangeText={(val) => handleNumericChange(setIntervalStr, "interval", val, 1)}
                placeholder="5"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={[styles.unit, { color: colors.textSecondary }]}>sec</Text>
            </View>
          </View>

          <Divider />

          <View style={styles.settingRow}>
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Movement Threshold</Text>
            </View>
            <View style={styles.inputWithUnit}>
              <TextInput
                style={inputStyle}
                keyboardType="numeric"
                value={distanceStr}
                onChangeText={(val) => handleNumericChange(setDistanceStr, "distance", val, 0)}
                placeholder="0"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={[styles.unit, { color: colors.textSecondary }]}>m</Text>
            </View>
          </View>

          <Divider />

          <Text style={[styles.label, styles.syncSectionLabel, { color: colors.textSecondary }]}>Sync Interval</Text>
          <View style={styles.syncGrid}>
            {SYNC_OPTIONS.map((opt) => {
              const selected = profile.syncInterval === opt.value
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.syncOption,
                    {
                      backgroundColor: selected ? colors.primary + "15" : colors.background,
                      borderColor: selected ? colors.primary : colors.border
                    }
                  ]}
                  onPress={() => setProfile((prev) => ({ ...prev, syncInterval: opt.value }))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.syncLabel, { color: selected ? colors.primary : colors.text }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Card>

        {/* Deactivation Delay */}
        <SectionTitle style={styles.sectionGap}>Deactivation</SectionTitle>
        <Card>
          <View style={styles.settingRow}>
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Deactivation Delay</Text>
              <Text style={[styles.settingHint, { color: colors.textLight }]}>
                Wait before reverting to default settings after the condition stops matching. Prevents rapid switching.
              </Text>
            </View>
            <View style={styles.inputWithUnit}>
              <TextInput
                style={inputStyle}
                keyboardType="numeric"
                value={delayStr}
                onChangeText={(val) => handleNumericChange(setDelayStr, "deactivationDelay", val, 0)}
                placeholder="60"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={[styles.unit, { color: colors.textSecondary }]}>sec</Text>
            </View>
          </View>
        </Card>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.7}
        >
          <Check size={20} color={colors.textOnPrimary} />
          <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Profile"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, ...fonts.bold, letterSpacing: -0.5 },
  inputGroup: { marginBottom: 4 },
  label: {
    fontSize: 12,
    ...fonts.semiBold,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  input: { padding: 14, borderWidth: 1.5, borderRadius: 10, fontSize: 15, ...fonts.regular },
  numInput: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    fontSize: 15,
    textAlign: "center",
    width: 64,
    ...fonts.regular
  },
  inputWithUnit: { flexDirection: "row", alignItems: "center", gap: 6 },
  unit: { fontSize: 14, ...fonts.medium, minWidth: 28 },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4
  },
  settingContent: { flex: 1, marginRight: 16 },
  settingLabel: { fontSize: 15, ...fonts.semiBold, marginBottom: 2 },
  settingHint: { fontSize: 12, ...fonts.regular, lineHeight: 16 },
  conditionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  conditionOption: {
    width: "47%",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 4
  },
  conditionLabel: { fontSize: 13, ...fonts.semiBold },
  conditionDesc: { fontSize: 11, ...fonts.regular, textAlign: "center" },
  syncGrid: { flexDirection: "row", gap: 8 },
  syncOption: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center"
  },
  syncLabel: { fontSize: 13, ...fonts.semiBold },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 16
  },
  saveBtnText: { fontSize: 16, ...fonts.semiBold },
  saveBtnDisabled: { opacity: 0.6 },
  syncSectionLabel: { marginBottom: 8 },
  sectionGap: { marginTop: 24 }
})
