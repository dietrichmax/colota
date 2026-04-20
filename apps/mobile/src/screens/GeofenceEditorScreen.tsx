/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TextInput,
  DeviceEventEmitter,
  InteractionManager
} from "react-native"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert, showConfirm } from "../services/modalService"
import { fonts } from "../styles/typography"
import { Container, SectionTitle, Card, SettingRow, Button } from "../components"
import { Check, Trash2 } from "lucide-react-native"
import { logger } from "../utils/logger"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../utils/geo"

export function GeofenceEditorScreen({ navigation, route }: any) {
  const { colors } = useTheme()
  const geofenceId = route?.params?.geofenceId as number | undefined
  const isEditing = !!geofenceId

  const [name, setName] = useState<string>(route?.params?.name ?? "")
  const initialRadius = route?.params?.radius ?? inputToMeters(50)
  const [radiusStr, setRadiusStr] = useState(String(metersToInput(initialRadius)))
  const [radius, setRadius] = useState<number>(initialRadius)
  const [pauseTracking, setPauseTracking] = useState(true)
  const [pauseOnWifi, setPauseOnWifi] = useState(false)
  const [pauseOnMotionless, setPauseOnMotionless] = useState(false)
  const [motionlessTimeoutMinutes, setMotionlessTimeoutMinutes] = useState(10)
  const [motionlessTimeoutStr, setMotionlessTimeoutStr] = useState("10")
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false)
  const [heartbeatIntervalMinutes, setHeartbeatIntervalMinutes] = useState(15)
  const [heartbeatIntervalStr, setHeartbeatIntervalStr] = useState("15")
  const [saving, setSaving] = useState(false)

  const savedState = useRef({
    name: route?.params?.name ?? ("" as string),
    radius: (route?.params?.radius ?? inputToMeters(50)) as number,
    pauseTracking: true,
    pauseOnWifi: false,
    pauseOnMotionless: false,
    motionlessTimeoutMinutes: 10,
    heartbeatEnabled: false,
    heartbeatIntervalMinutes: 15
  })

  const hasChanges = useMemo(() => {
    const s = savedState.current
    return (
      name !== s.name ||
      radius !== s.radius ||
      pauseTracking !== s.pauseTracking ||
      pauseOnWifi !== s.pauseOnWifi ||
      pauseOnMotionless !== s.pauseOnMotionless ||
      motionlessTimeoutMinutes !== s.motionlessTimeoutMinutes ||
      heartbeatEnabled !== s.heartbeatEnabled ||
      heartbeatIntervalMinutes !== s.heartbeatIntervalMinutes
    )
  }, [
    name,
    radius,
    pauseTracking,
    pauseOnWifi,
    pauseOnMotionless,
    motionlessTimeoutMinutes,
    heartbeatEnabled,
    heartbeatIntervalMinutes
  ])

  useEffect(() => {
    if (!geofenceId) return

    const task = InteractionManager.runAfterInteractions(() => {
      NativeLocationService.getGeofences()
        .then((geofences) => {
          const existing = geofences.find((g) => g.id === geofenceId)
          if (existing) {
            setName(existing.name)
            setRadiusStr(String(metersToInput(existing.radius)))
            setRadius(existing.radius)
            setPauseTracking(existing.pauseTracking)
            setPauseOnWifi(existing.pauseOnWifi)
            setPauseOnMotionless(existing.pauseOnMotionless)
            setMotionlessTimeoutMinutes(existing.motionlessTimeoutMinutes)
            setMotionlessTimeoutStr(String(existing.motionlessTimeoutMinutes))
            setHeartbeatEnabled(existing.heartbeatEnabled ?? false)
            setHeartbeatIntervalMinutes(existing.heartbeatIntervalMinutes ?? 15)
            setHeartbeatIntervalStr(String(existing.heartbeatIntervalMinutes ?? 15))
            savedState.current = {
              name: existing.name,
              radius: existing.radius,
              pauseTracking: existing.pauseTracking,
              pauseOnWifi: existing.pauseOnWifi,
              pauseOnMotionless: existing.pauseOnMotionless,
              motionlessTimeoutMinutes: existing.motionlessTimeoutMinutes,
              heartbeatEnabled: existing.heartbeatEnabled ?? false,
              heartbeatIntervalMinutes: existing.heartbeatIntervalMinutes ?? 15
            }
          }
        })
        .catch((err) => {
          logger.error("[GeofenceEditor] Failed to load geofence:", err)
          showAlert("Error", "Failed to load geofence data.", "error")
          navigation.goBack()
        })
    })

    return () => task.cancel()
  }, [geofenceId, navigation])

  const handleRadiusChange = useCallback((val: string) => {
    setRadiusStr(val)
    const num = Number(val)
    if (!isNaN(num) && num > 0) setRadius(inputToMeters(num))
  }, [])

  const handleTimeoutChange = useCallback((val: string) => {
    setMotionlessTimeoutStr(val)
    const num = parseInt(val, 10)
    if (!isNaN(num) && num >= 1) setMotionlessTimeoutMinutes(num)
  }, [])

  const handleHeartbeatIntervalChange = useCallback((val: string) => {
    setHeartbeatIntervalStr(val)
    const num = parseInt(val, 10)
    if (!isNaN(num) && num >= 1) setHeartbeatIntervalMinutes(num)
  }, [])

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showAlert("Missing Name", "Please enter a name.", "warning")
      return
    }
    if (radius <= 0) {
      showAlert("Invalid Radius", "Please enter a valid radius.", "warning")
      return
    }
    if (heartbeatEnabled && heartbeatIntervalMinutes < 1) {
      showAlert("Invalid Heartbeat", "Heartbeat interval must be at least 1 minute.", "warning")
      return
    }

    setSaving(true)
    try {
      if (isEditing && geofenceId) {
        await NativeLocationService.updateGeofence({
          id: geofenceId,
          name: name.trim(),
          radius,
          pauseTracking,
          pauseOnWifi,
          pauseOnMotionless,
          motionlessTimeoutMinutes,
          heartbeatEnabled,
          heartbeatIntervalMinutes
        })
      } else {
        const lat = route?.params?.lat as number
        const lon = route?.params?.lon as number
        await NativeLocationService.createGeofence({
          name: name.trim(),
          lat,
          lon,
          radius,
          enabled: true,
          pauseTracking,
          pauseOnWifi,
          pauseOnMotionless,
          motionlessTimeoutMinutes,
          heartbeatEnabled,
          heartbeatIntervalMinutes
        })
      }
      DeviceEventEmitter.emit("geofenceUpdated")
      navigation.goBack()
    } catch (err) {
      logger.error("[GeofenceEditor] Save failed:", err)
      showAlert("Error", "Failed to save geofence.", "error")
    } finally {
      setSaving(false)
    }
  }, [
    name,
    radius,
    pauseTracking,
    pauseOnWifi,
    pauseOnMotionless,
    motionlessTimeoutMinutes,
    heartbeatEnabled,
    heartbeatIntervalMinutes,
    isEditing,
    geofenceId,
    navigation,
    route
  ])

  const handleDelete = useCallback(async () => {
    if (!geofenceId) return
    const confirmed = await showConfirm({
      title: "Delete Geofence",
      message: `Delete "${name}"?`,
      confirmText: "Delete",
      destructive: true
    })
    if (!confirmed) return
    try {
      await NativeLocationService.deleteGeofence(geofenceId)
      DeviceEventEmitter.emit("geofenceUpdated")
      navigation.goBack()
    } catch (err) {
      logger.error("[GeofenceEditor] Delete failed:", err)
      showAlert("Error", "Failed to delete geofence.", "error")
    }
  }, [geofenceId, name, navigation])

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
  ]

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionTitle>General</SectionTitle>
        <Card style={styles.card}>
          <SettingRow label="Name">
            <TextInput
              testID="geofence-name-input"
              style={[inputStyle, styles.nameInput]}
              value={name}
              onChangeText={setName}
              placeholder="Home, Work..."
              placeholderTextColor={colors.placeholder}
            />
          </SettingRow>
          <SettingRow label={`Radius (${shortDistanceUnit()})`}>
            <TextInput
              testID="geofence-radius-input"
              style={[inputStyle, styles.numInput]}
              value={radiusStr}
              onChangeText={handleRadiusChange}
              placeholder="50"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />
          </SettingRow>
        </Card>

        <SectionTitle>GPS Pause Options</SectionTitle>
        <Card style={styles.card}>
          <SettingRow label="Don't record in zone" hint="Pause saving and syncing" style={styles.toggleRow}>
            <Switch
              testID="pause-tracking-toggle"
              value={pauseTracking}
              onValueChange={setPauseTracking}
              trackColor={{ false: colors.border, true: colors.warning + "80" }}
              thumbColor={pauseTracking ? colors.warning : colors.border}
            />
          </SettingRow>

          <SettingRow
            label="WiFi/Ethernet pause"
            hint="Stop GPS on unmetered networks"
            style={[styles.toggleRow, !pauseTracking && styles.disabledRow]}
          >
            <Switch
              testID="pause-wifi-toggle"
              value={pauseOnWifi}
              onValueChange={setPauseOnWifi}
              disabled={!pauseTracking}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={pauseOnWifi ? colors.primary : colors.border}
            />
          </SettingRow>

          <SettingRow
            label="Motionless pause"
            hint="Stop GPS after no motion for a set time"
            style={[styles.toggleRow, !pauseTracking && styles.disabledRow]}
          >
            <Switch
              testID="pause-motionless-toggle"
              value={pauseOnMotionless}
              onValueChange={setPauseOnMotionless}
              disabled={!pauseTracking}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={pauseOnMotionless ? colors.primary : colors.border}
            />
          </SettingRow>

          {pauseTracking && pauseOnMotionless && (
            <View style={[styles.nestedSetting, { borderLeftColor: colors.border }]}>
              <SettingRow label="Timeout (min)" hint="Minutes without motion before GPS stops">
                <TextInput
                  testID="motionless-timeout-input"
                  style={[inputStyle, styles.numInput]}
                  value={motionlessTimeoutStr}
                  onChangeText={handleTimeoutChange}
                  placeholder="10"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numeric"
                />
              </SettingRow>
            </View>
          )}

          <SettingRow
            label="Stationary heartbeat"
            hint="Periodic server update while paused"
            style={[styles.toggleRow, !pauseTracking && styles.disabledRow]}
          >
            <Switch
              testID="heartbeat-toggle"
              value={heartbeatEnabled}
              onValueChange={setHeartbeatEnabled}
              disabled={!pauseTracking}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={heartbeatEnabled ? colors.primary : colors.border}
            />
          </SettingRow>

          {pauseTracking && heartbeatEnabled && (
            <View style={[styles.nestedSetting, { borderLeftColor: colors.border }]}>
              <SettingRow label="Interval (min)" hint="How often to send a location update">
                <TextInput
                  testID="heartbeat-interval-input"
                  style={[inputStyle, styles.numInput]}
                  value={heartbeatIntervalStr}
                  onChangeText={handleHeartbeatIntervalChange}
                  placeholder="15"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numeric"
                />
              </SettingRow>
            </View>
          )}

          {pauseTracking && pauseOnWifi && pauseOnMotionless && (
            <View style={[styles.combinedNote, { borderTopColor: colors.border }]}>
              <Text style={[styles.combinedNoteText, { color: colors.textSecondary }]}>
                GPS resumes only when both WiFi is disconnected and motion is detected
              </Text>
            </View>
          )}
        </Card>

        <Button
          title={saving ? "Saving..." : "Save Geofence"}
          onPress={handleSave}
          disabled={saving || (isEditing && !hasChanges)}
          icon={Check}
        />
        {isEditing && <Button title="Delete Geofence" onPress={handleDelete} variant="danger" icon={Trash2} />}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  card: { marginBottom: 16 },
  input: {
    padding: 10,
    borderWidth: 1.5,
    borderRadius: 8,
    fontSize: 15
  },
  nameInput: { flex: 1 },
  numInput: { width: 80, textAlign: "center" },
  toggleRow: { paddingVertical: 10 },
  disabledRow: { opacity: 0.45 },
  nestedSetting: { marginLeft: 16, paddingLeft: 12, borderLeftWidth: 3, marginTop: 4, marginBottom: 4 },
  combinedNote: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  combinedNoteText: {
    fontSize: 12,
    ...fonts.regular,
    lineHeight: 17,
    fontStyle: "italic"
  }
})
