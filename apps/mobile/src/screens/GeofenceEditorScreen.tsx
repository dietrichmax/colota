/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { View, Text, StyleSheet, ScrollView, DeviceEventEmitter } from "react-native"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert, showConfirm } from "../services/modalService"
import { fontSizes, fonts, lineHeights } from "../styles/typography"
import {
  Button,
  Card,
  Container,
  FieldMessage,
  ListItem,
  SectionTitle,
  SettingRow,
  Toggle,
  TextField
} from "../components"
import { Check, Trash2 } from "lucide-react-native"
import { logger } from "../utils/logger"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../utils/geo"
import { parsePositiveInt, isPositiveInt } from "../utils/settingsValidation"
import type { RootScreenProps } from "../types/navigation"
import { size, space } from "../constants"
import { useTranslation } from "../i18n/useTranslation"
import { t as translate } from "../i18n/t"

declare function requestIdleCallback(callback: () => void): number
declare function cancelIdleCallback(handle: number): void

export function GeofenceEditorScreen({ navigation, route }: RootScreenProps<"Geofence Editor">) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const geofenceId = route?.params?.geofenceId as number | undefined
  const isEditing = !!geofenceId

  const [name, setName] = useState<string>(route?.params?.name ?? "")
  const initialRadius = route?.params?.radius ?? inputToMeters(50)
  const [radiusStr, setRadiusStr] = useState(String(metersToInput(initialRadius)))
  const [radius, setRadius] = useState<number>(initialRadius)
  const [pauseTracking, setPauseTracking] = useState(true)
  const [pauseOnWifi, setPauseOnWifi] = useState(false)
  const [pauseOnMotionless, setPauseOnMotionless] = useState(false)
  const [motionlessTimeoutStr, setMotionlessTimeoutStr] = useState("1")
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false)
  const [heartbeatIntervalStr, setHeartbeatIntervalStr] = useState("15")
  const [saving, setSaving] = useState(false)
  const placedOnEntry = useRef(route?.params?.lat != null)
  const [coord, setCoord] = useState<{ lat: number; lon: number } | null>(
    route?.params?.lat != null && route?.params?.lon != null ? { lat: route.params.lat, lon: route.params.lon } : null
  )

  const savedState = useRef({
    name: route?.params?.name ?? ("" as string),
    radius: (route?.params?.radius ?? inputToMeters(50)) as number,
    pauseTracking: true,
    pauseOnWifi: false,
    pauseOnMotionless: false,
    motionlessTimeoutStr: "1",
    heartbeatEnabled: false,
    heartbeatIntervalStr: "15",
    coord: null as { lat: number; lon: number } | null
  })

  const hasChanges = useMemo(() => {
    const s = savedState.current
    return (
      name !== s.name ||
      coord?.lat !== s.coord?.lat ||
      coord?.lon !== s.coord?.lon ||
      radius !== s.radius ||
      pauseTracking !== s.pauseTracking ||
      pauseOnWifi !== s.pauseOnWifi ||
      pauseOnMotionless !== s.pauseOnMotionless ||
      parsePositiveInt(motionlessTimeoutStr, 10) !== parsePositiveInt(s.motionlessTimeoutStr, 10) ||
      heartbeatEnabled !== s.heartbeatEnabled ||
      parsePositiveInt(heartbeatIntervalStr, 15) !== parsePositiveInt(s.heartbeatIntervalStr, 15)
    )
  }, [
    name,
    coord,
    radius,
    pauseTracking,
    pauseOnWifi,
    pauseOnMotionless,
    motionlessTimeoutStr,
    heartbeatEnabled,
    heartbeatIntervalStr
  ])

  useEffect(() => {
    if (!geofenceId) return

    let cancelled = false

    const handle = requestIdleCallback(() => {
      NativeLocationService.getGeofences()
        .then((geofences) => {
          if (cancelled) return
          const existing = geofences.find((g) => g.id === geofenceId)
          if (existing) {
            setName(existing.name)
            setRadiusStr(String(metersToInput(existing.radius)))
            setRadius(existing.radius)
            // A coordinate carried in is newer than the stored one, so the load must not undo it.
            if (!placedOnEntry.current) setCoord({ lat: existing.lat, lon: existing.lon })
            setPauseTracking(existing.pauseTracking)
            setPauseOnWifi(existing.pauseOnWifi)
            setPauseOnMotionless(existing.pauseOnMotionless)
            setMotionlessTimeoutStr(String(existing.motionlessTimeoutMinutes))
            setHeartbeatEnabled(existing.heartbeatEnabled ?? false)
            setHeartbeatIntervalStr(String(existing.heartbeatIntervalMinutes ?? 15))
            savedState.current = {
              name: existing.name,
              radius: existing.radius,
              pauseTracking: existing.pauseTracking,
              pauseOnWifi: existing.pauseOnWifi,
              pauseOnMotionless: existing.pauseOnMotionless,
              motionlessTimeoutStr: String(existing.motionlessTimeoutMinutes),
              heartbeatEnabled: existing.heartbeatEnabled ?? false,
              heartbeatIntervalStr: String(existing.heartbeatIntervalMinutes ?? 15),
              coord: { lat: existing.lat, lon: existing.lon }
            }
          }
        })
        .catch((err) => {
          if (cancelled) return
          logger.error("[GeofenceEditor] Failed to load geofence:", err)
          // The non-hook t, so a language change never re-runs the load over unsaved edits.
          showAlert(translate("common.error"), translate("geofenceEditor.loadFailed"), "error")
          navigation.goBack()
        })
    })

    return () => {
      cancelled = true
      cancelIdleCallback(handle)
    }
  }, [geofenceId, navigation])

  useEffect(() => {
    const { lat, lon } = route?.params ?? {}
    if (lat != null && lon != null) setCoord({ lat, lon })
  }, [route?.params])

  const handleRadiusChange = useCallback((val: string) => {
    setRadiusStr(val)
    const num = Number(val)
    if (!isNaN(num) && num > 0) setRadius(inputToMeters(num))
  }, [])

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showAlert(t("geofenceEditor.missingName.title"), t("geofenceEditor.missingName.message"), "warning")
      return
    }
    if (radius <= 0) {
      showAlert(t("geofenceEditor.invalidRadius.title"), t("geofenceEditor.invalidRadius.message"), "warning")
      return
    }
    const effectiveHeartbeat = parsePositiveInt(heartbeatIntervalStr, 15)
    const effectiveTimeout = parsePositiveInt(motionlessTimeoutStr, 10)

    setSaving(true)
    try {
      if (isEditing && geofenceId) {
        await NativeLocationService.updateGeofence({
          id: geofenceId,
          name: name.trim(),
          lat: coord?.lat,
          lon: coord?.lon,
          radius,
          pauseTracking,
          pauseOnWifi,
          pauseOnMotionless,
          motionlessTimeoutMinutes: effectiveTimeout,
          heartbeatEnabled,
          heartbeatIntervalMinutes: effectiveHeartbeat
        })
      } else {
        if (!coord) {
          showAlert(t("geofenceEditor.noLocation.title"), t("geofenceEditor.noLocation.message"), "warning")
          setSaving(false)
          return
        }
        await NativeLocationService.createGeofence({
          name: name.trim(),
          lat: coord.lat,
          lon: coord.lon,
          radius,
          enabled: true,
          pauseTracking,
          pauseOnWifi,
          pauseOnMotionless,
          motionlessTimeoutMinutes: effectiveTimeout,
          heartbeatEnabled,
          heartbeatIntervalMinutes: effectiveHeartbeat
        })
      }
      DeviceEventEmitter.emit("geofenceUpdated")
      navigation.goBack()
    } catch (err) {
      logger.error("[GeofenceEditor] Save failed:", err)
      showAlert(t("common.error"), t("geofenceEditor.saveFailed"), "error")
    } finally {
      setSaving(false)
    }
  }, [
    name,
    coord,
    radius,
    pauseTracking,
    pauseOnWifi,
    pauseOnMotionless,
    motionlessTimeoutStr,
    heartbeatEnabled,
    heartbeatIntervalStr,
    isEditing,
    geofenceId,
    navigation,
    t
  ])

  const handleDelete = useCallback(async () => {
    if (!geofenceId) return
    const confirmed = await showConfirm({
      title: t("geofenceEditor.delete.title"),
      message: t("geofenceEditor.delete.message", { name }),
      confirmText: t("common.delete"),
      destructive: true
    })
    if (!confirmed) return
    try {
      await NativeLocationService.deleteGeofence(geofenceId)
      DeviceEventEmitter.emit("geofenceUpdated")
      navigation.goBack()
    } catch (err) {
      logger.error("[GeofenceEditor] Delete failed:", err)
      showAlert(t("common.error"), t("geofenceEditor.deleteFailed"), "error")
    }
  }, [geofenceId, name, navigation, t])

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionTitle>{t("geofenceEditor.section.general")}</SectionTitle>
        <Card rows style={styles.card}>
          <SettingRow label={t("geofenceEditor.name")}>
            <TextField
              testID="geofence-name-input"
              accessibilityLabel={t("geofenceEditor.name")}
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={t("geofenceEditor.name.placeholder")}
            />
          </SettingRow>
          <SettingRow label={t("geofenceEditor.radius", { unit: shortDistanceUnit() })}>
            <TextField
              testID="geofence-radius-input"
              accessibilityLabel={t("geofenceEditor.radius.a11y")}
              figure
              style={styles.numInput}
              value={radiusStr}
              onChangeText={handleRadiusChange}
              placeholder="50"
              keyboardType="numeric"
            />
          </SettingRow>
          <ListItem
            testID="place-zone-row"
            label={t("geofenceEditor.location")}
            sub={coord ? `${coord.lat.toFixed(5)}, ${coord.lon.toFixed(5)}` : t("geofenceEditor.location.notPlaced")}
            onPress={() =>
              navigation.navigate("Place Zone", {
                name: name.trim() || t("geofenceEditor.newZone"),
                radius,
                lat: coord?.lat,
                lon: coord?.lon
              })
            }
          />
        </Card>

        <SectionTitle>{t("geofenceEditor.section.pause")}</SectionTitle>
        <Card rows style={[styles.card, styles.cardTail]}>
          <SettingRow label={t("geofenceEditor.pause")} hint={t("geofenceEditor.pause.hint")}>
            <Toggle
              accessibilityLabel={t("geofenceEditor.pause")}
              testID="pause-tracking-toggle"
              value={pauseTracking}
              onValueChange={setPauseTracking}
            />
          </SettingRow>

          <SettingRow label={t("geofenceEditor.wifi")} hint={t("geofenceEditor.wifi.hint")} disabled={!pauseTracking}>
            <Toggle
              accessibilityLabel={t("geofenceEditor.wifi")}
              testID="pause-wifi-toggle"
              value={pauseOnWifi}
              onValueChange={setPauseOnWifi}
              disabled={!pauseTracking}
            />
          </SettingRow>

          <SettingRow
            label={t("geofenceEditor.motionless")}
            hint={t("geofenceEditor.motionless.hint")}
            disabled={!pauseTracking}
          >
            <Toggle
              accessibilityLabel={t("geofenceEditor.motionless")}
              testID="pause-motionless-toggle"
              value={pauseOnMotionless}
              onValueChange={setPauseOnMotionless}
              disabled={!pauseTracking}
            />
          </SettingRow>

          {pauseTracking && pauseOnMotionless && (
            <View style={styles.nestedSetting}>
              <SettingRow label={t("geofenceEditor.timeout")} hint={t("geofenceEditor.timeout.hint")}>
                <TextField
                  testID="motionless-timeout-input"
                  accessibilityLabel={t("geofenceEditor.timeout.a11y")}
                  figure
                  style={styles.numInput}
                  value={motionlessTimeoutStr}
                  onChangeText={setMotionlessTimeoutStr}
                  placeholder="1"
                  keyboardType="number-pad"
                />
              </SettingRow>
              {!isPositiveInt(motionlessTimeoutStr) && (
                <FieldMessage variant="error">{t("geofenceEditor.atLeastMinute")}</FieldMessage>
              )}
            </View>
          )}

          <SettingRow
            label={t("geofenceEditor.heartbeat")}
            hint={t("geofenceEditor.heartbeat.hint")}
            disabled={!pauseTracking}
          >
            <Toggle
              accessibilityLabel={t("geofenceEditor.heartbeat")}
              testID="heartbeat-toggle"
              value={heartbeatEnabled}
              onValueChange={setHeartbeatEnabled}
              disabled={!pauseTracking}
            />
          </SettingRow>

          {pauseTracking && heartbeatEnabled && (
            <View style={styles.nestedSetting}>
              <SettingRow
                label={t("geofenceEditor.heartbeatInterval")}
                hint={t("geofenceEditor.heartbeatInterval.hint")}
              >
                <TextField
                  testID="heartbeat-interval-input"
                  accessibilityLabel={t("geofenceEditor.heartbeatInterval.a11y")}
                  figure
                  style={styles.numInput}
                  value={heartbeatIntervalStr}
                  onChangeText={setHeartbeatIntervalStr}
                  placeholder="15"
                  keyboardType="number-pad"
                />
              </SettingRow>
              {!isPositiveInt(heartbeatIntervalStr) && (
                <FieldMessage variant="error">{t("geofenceEditor.atLeastMinute")}</FieldMessage>
              )}
            </View>
          )}

          {pauseTracking && pauseOnWifi && pauseOnMotionless && (
            <View style={[styles.combinedNote, { borderTopColor: colors.divider }]}>
              <Text style={[styles.combinedNoteText, { color: colors.textSecondary }]}>
                {t("geofenceEditor.combined")}
              </Text>
            </View>
          )}
        </Card>

        <Button
          title={t("geofenceEditor.save")}
          loading={saving}
          onPress={handleSave}
          disabled={
            saving ||
            (isEditing && !hasChanges) ||
            (heartbeatEnabled && !isPositiveInt(heartbeatIntervalStr)) ||
            (pauseOnMotionless && !isPositiveInt(motionlessTimeoutStr))
          }
          icon={Check}
        />
        {isEditing && (
          <Button title={t("geofenceEditor.delete.title")} onPress={handleDelete} variant="danger" icon={Trash2} />
        )}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  cardTail: { paddingBottom: space.lg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  card: { marginBottom: space.lg },
  nameInput: { flex: 1 },
  numInput: { width: size.numericField },
  nestedSetting: {
    marginTop: space.md,
    marginStart: space.lg
  },
  combinedNote: {
    marginTop: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  combinedNoteText: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    lineHeight: lineHeights.caption,
    fontStyle: "italic"
  }
})
