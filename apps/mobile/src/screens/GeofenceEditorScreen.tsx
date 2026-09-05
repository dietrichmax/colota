/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from "react"
import { View, StyleSheet, ScrollView, DeviceEventEmitter } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert, showConfirm } from "../services/modalService"
import { size, space } from "../constants"
import {
  Button,
  Container,
  Divider,
  FieldMessage,
  ListItem,
  NumericInput,
  SectionTitle,
  SettingRow,
  TextField,
  Toggle
} from "../components"
import { logger } from "../utils/logger"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../utils/geo"
import { parsePositiveInt, isPositiveInt } from "../utils/settingsValidation"
import type { RootScreenProps } from "../types/navigation"

declare function requestIdleCallback(callback: () => void): number
declare function cancelIdleCallback(handle: number): void

// The sticky footer floats over the form, so the scroll content ends above it.
const FOOTER_HEIGHT = size.touch + space.lg * 2

const COORD_PRECISION = 6
const DEFAULT_RADIUS_INPUT = 50

type Center = { lat: number; lon: number }

export function GeofenceEditorScreen({ navigation, route }: RootScreenProps<"Geofence Editor">) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const geofenceId = route?.params?.geofenceId
  const isEditing = !!geofenceId
  const placedLat = route?.params?.lat
  const placedLon = route?.params?.lon

  const [name, setName] = useState("")
  const [radiusStr, setRadiusStr] = useState(String(DEFAULT_RADIUS_INPUT))
  const [radius, setRadius] = useState(inputToMeters(DEFAULT_RADIUS_INPUT))
  const [center, setCenter] = useState<Center | null>(null)
  const [pauseTracking, setPauseTracking] = useState(true)
  const [pauseOnWifi, setPauseOnWifi] = useState(false)
  const [pauseOnMotionless, setPauseOnMotionless] = useState(false)
  const [motionlessTimeoutStr, setMotionlessTimeoutStr] = useState("1")
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false)
  const [heartbeatIntervalStr, setHeartbeatIntervalStr] = useState("15")
  const [saving, setSaving] = useState(false)

  const savedState = useRef({
    name: "",
    radius: inputToMeters(DEFAULT_RADIUS_INPUT),
    center: null as Center | null,
    pauseTracking: true,
    pauseOnWifi: false,
    pauseOnMotionless: false,
    motionlessTimeoutStr: "1",
    heartbeatEnabled: false,
    heartbeatIntervalStr: "15"
  })

  // headerTitle, not title: SCREEN_CONFIG sets headerTitle and native-stack prefers it.
  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: isEditing ? t("geofenceEditor.edit") : t("geofenceEditor.new") })
  }, [navigation, isEditing, t])

  const hasChanges = useMemo(() => {
    const s = savedState.current
    return (
      name !== s.name ||
      radius !== s.radius ||
      center?.lat !== s.center?.lat ||
      center?.lon !== s.center?.lon ||
      pauseTracking !== s.pauseTracking ||
      pauseOnWifi !== s.pauseOnWifi ||
      pauseOnMotionless !== s.pauseOnMotionless ||
      parsePositiveInt(motionlessTimeoutStr, 10) !== parsePositiveInt(s.motionlessTimeoutStr, 10) ||
      heartbeatEnabled !== s.heartbeatEnabled ||
      parsePositiveInt(heartbeatIntervalStr, 15) !== parsePositiveInt(s.heartbeatIntervalStr, 15)
    )
  }, [
    name,
    radius,
    center,
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
            setCenter({ lat: existing.lat, lon: existing.lon })
            setPauseTracking(existing.pauseTracking)
            setPauseOnWifi(existing.pauseOnWifi)
            setPauseOnMotionless(existing.pauseOnMotionless)
            setMotionlessTimeoutStr(String(existing.motionlessTimeoutMinutes))
            setHeartbeatEnabled(existing.heartbeatEnabled ?? false)
            setHeartbeatIntervalStr(String(existing.heartbeatIntervalMinutes ?? 15))
            savedState.current = {
              name: existing.name,
              radius: existing.radius,
              center: { lat: existing.lat, lon: existing.lon },
              pauseTracking: existing.pauseTracking,
              pauseOnWifi: existing.pauseOnWifi,
              pauseOnMotionless: existing.pauseOnMotionless,
              motionlessTimeoutStr: String(existing.motionlessTimeoutMinutes),
              heartbeatEnabled: existing.heartbeatEnabled ?? false,
              heartbeatIntervalStr: String(existing.heartbeatIntervalMinutes ?? 15)
            }
          }
        })
        .catch((err) => {
          if (cancelled) return
          logger.error("[GeofenceEditor] Failed to load geofence:", err)
          showAlert(t("geofenceEditor.error"), t("geofenceEditor.error.load"), "error")
          navigation.goBack()
        })
    })

    return () => {
      cancelled = true
      cancelIdleCallback(handle)
    }
  }, [geofenceId, navigation, t])

  // The map step is a pushed route: it hands the centre back as params and the draft, which
  // never left this screen's state, is still here whether the user confirms or presses back.
  useEffect(() => {
    if (placedLat == null || placedLon == null) return
    setCenter({ lat: placedLat, lon: placedLon })
  }, [placedLat, placedLon])

  const handleRadiusChange = useCallback((val: string) => {
    setRadiusStr(val)
    const num = Number(val)
    if (!isNaN(num) && num > 0) setRadius(inputToMeters(num))
  }, [])

  const handlePlaceOnMap = useCallback(() => {
    navigation.navigate("Place Zone", {
      name: name.trim() || undefined,
      radius,
      lat: center?.lat,
      lon: center?.lon
    })
  }, [navigation, name, radius, center])

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showAlert(t("geofenceEditor.missingName"), t("geofenceEditor.missingName.message"), "warning")
      return
    }
    if (radius <= 0) {
      showAlert(t("geofenceEditor.invalidRadius"), t("geofenceEditor.invalidRadius.message"), "warning")
      return
    }
    if (!center) {
      showAlert(t("geofenceEditor.missingLocation"), t("geofenceEditor.missingLocation.message"), "warning")
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
          lat: center.lat,
          lon: center.lon,
          radius,
          pauseTracking,
          pauseOnWifi,
          pauseOnMotionless,
          motionlessTimeoutMinutes: effectiveTimeout,
          heartbeatEnabled,
          heartbeatIntervalMinutes: effectiveHeartbeat
        })
      } else {
        await NativeLocationService.createGeofence({
          name: name.trim(),
          lat: center.lat,
          lon: center.lon,
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
      showAlert(t("geofenceEditor.error"), t("geofenceEditor.error.save"), "error")
    } finally {
      setSaving(false)
    }
  }, [
    name,
    radius,
    center,
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
      confirmText: t("geofenceEditor.delete.confirm"),
      destructive: true
    })
    if (!confirmed) return
    try {
      await NativeLocationService.deleteGeofence(geofenceId)
      DeviceEventEmitter.emit("geofenceUpdated")
      navigation.goBack()
    } catch (err) {
      logger.error("[GeofenceEditor] Delete failed:", err)
      showAlert(t("geofenceEditor.error"), t("geofenceEditor.error.delete"), "error")
    }
  }, [geofenceId, name, navigation, t])

  const centreLabel = center
    ? `${center.lat.toFixed(COORD_PRECISION)}, ${center.lon.toFixed(COORD_PRECISION)}`
    : t("geofenceEditor.place.unset")

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle first>{t("geofenceEditor.zone")}</SectionTitle>

        <TextField
          testID="geofence-name-input"
          label={t("geofenceEditor.name")}
          placeholder={t("geofenceEditor.name.placeholder")}
          value={name}
          onChangeText={setName}
        />

        <NumericInput
          testID="geofence-radius-input"
          label={t("geofenceEditor.radius")}
          value={radiusStr}
          onChange={handleRadiusChange}
          onBlur={() => {}}
          unit={shortDistanceUnit()}
          placeholder="50"
        />

        <Divider tight />

        <ListItem
          testID="place-on-map-btn"
          label={t("geofenceEditor.place")}
          sub={centreLabel}
          onPress={handlePlaceOnMap}
        />

        <SectionTitle>{t("geofenceEditor.pauseOptions")}</SectionTitle>

        <SettingRow label={t("geofenceEditor.pauseTracking")} hint={t("geofenceEditor.pauseTracking.hint")}>
          <Toggle
            testID="pause-tracking-toggle"
            value={pauseTracking}
            onValueChange={setPauseTracking}
            accessibilityLabel={t("geofenceEditor.pauseTracking")}
          />
        </SettingRow>

        <Divider tight />

        <SettingRow label={t("geofenceEditor.wifi")} hint={t("geofenceEditor.wifi.hint")}>
          <Toggle
            testID="pause-wifi-toggle"
            value={pauseOnWifi}
            onValueChange={setPauseOnWifi}
            disabled={!pauseTracking}
            accessibilityLabel={t("geofenceEditor.wifi")}
          />
        </SettingRow>

        <Divider tight />

        <SettingRow label={t("geofenceEditor.motionless")} hint={t("geofenceEditor.motionless.hint")}>
          <Toggle
            testID="pause-motionless-toggle"
            value={pauseOnMotionless}
            onValueChange={setPauseOnMotionless}
            disabled={!pauseTracking}
            accessibilityLabel={t("geofenceEditor.motionless")}
          />
        </SettingRow>

        {pauseTracking && pauseOnMotionless && (
          <View style={styles.indented}>
            <NumericInput
              testID="motionless-timeout-input"
              label={t("geofenceEditor.timeout")}
              hint={t("geofenceEditor.timeout.hint")}
              value={motionlessTimeoutStr}
              onChange={setMotionlessTimeoutStr}
              onBlur={() => {}}
              unit={t("geofenceEditor.unit.minutes")}
              placeholder="1"
            />
            {!isPositiveInt(motionlessTimeoutStr) && (
              <FieldMessage variant="error">{t("geofenceEditor.minimumMinutes")}</FieldMessage>
            )}
          </View>
        )}

        <Divider tight />

        <SettingRow label={t("geofenceEditor.heartbeat")} hint={t("geofenceEditor.heartbeat.hint")}>
          <Toggle
            testID="heartbeat-toggle"
            value={heartbeatEnabled}
            onValueChange={setHeartbeatEnabled}
            disabled={!pauseTracking}
            accessibilityLabel={t("geofenceEditor.heartbeat")}
          />
        </SettingRow>

        {pauseTracking && heartbeatEnabled && (
          <View style={styles.indented}>
            <NumericInput
              testID="heartbeat-interval-input"
              label={t("geofenceEditor.interval")}
              hint={t("geofenceEditor.interval.hint")}
              value={heartbeatIntervalStr}
              onChange={setHeartbeatIntervalStr}
              onBlur={() => {}}
              unit={t("geofenceEditor.unit.minutes")}
              placeholder="15"
            />
            {!isPositiveInt(heartbeatIntervalStr) && (
              <FieldMessage variant="error">{t("geofenceEditor.minimumMinutes")}</FieldMessage>
            )}
          </View>
        )}

        {pauseTracking && pauseOnWifi && pauseOnMotionless && (
          <FieldMessage>{t("geofenceEditor.combined")}</FieldMessage>
        )}

        {isEditing && (
          <View style={styles.destructive}>
            <Divider tight inset={space.lg} />
            <Button
              testID="delete-geofence-btn"
              title={t("geofenceEditor.delete")}
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
          <Button
            testID="save-geofence-btn"
            title={t("geofenceEditor.save")}
            loading={saving}
            onPress={handleSave}
            disabled={
              (isEditing && !hasChanges) ||
              (heartbeatEnabled && !isPositiveInt(heartbeatIntervalStr)) ||
              (pauseOnMotionless && !isPositiveInt(motionlessTimeoutStr))
            }
          />
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
  // A field that belongs to the row above it starts inside that row's text column.
  indented: {
    marginStart: space.lg
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
