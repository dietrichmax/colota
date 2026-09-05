/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useState, useCallback, useRef } from "react"
import { StyleSheet, View, Text, ScrollView, DeviceEventEmitter, AppState, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ScreenProps, DatabaseStats } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { useFocusEffect } from "@react-navigation/native"
import { showAlert, showConfirm } from "../services/modalService"
import {
  Button,
  Card,
  ConnectionStatus,
  DashboardMap,
  CoordinateDisplay,
  Container,
  DatabaseStatistics,
  Divider,
  MapOverlay,
  WelcomeCard
} from "../components"
import {
  STATS_REFRESH_IDLE,
  MIN_STATS_INTERVAL_MS,
  MAP_HERO_FRACTION,
  MAP_HERO_MIN_HEIGHT,
  MAP_HERO_SHEET_RESERVE,
  SHORT_WINDOW_HEIGHT,
  elevation,
  size,
  space
} from "../constants"
import { text } from "../styles/typography"
import { Square, Play } from "lucide-react-native"
import { logger } from "../utils/logger"

// The Start control straddles the seam, so the sheet starts below its lower half.
const PILL_OVERHANG = size.touch / 2

export function DashboardScreen({ navigation }: ScreenProps) {
  const { settings, tracking, startTracking, stopTracking, setSettings, activeProfileName, settingsHydrated } =
    useTracking()
  const { colors, mode } = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()

  const [stats, setStats] = useState<DatabaseStats>({
    queued: 0,
    sent: 0,
    total: 0,
    today: 0,
    databaseSizeMB: 0
  })

  const prevStats = useRef(stats)
  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)
  const [pauseReason, setPauseReason] = useState<string | null>(null)
  const [isBatteryCritical, setIsBatteryCritical] = useState(false)
  const [locationEnabled, setLocationEnabled] = useState(true)

  // useWindowDimensions reports the whole window under forced edge-to-edge, and the tab bar is a
  // flex sibling of the navigator, so the map is measured against what is left after it.
  const available = Math.max(windowHeight - (size.row + insets.bottom), 0)
  const mapHeight = Math.round(
    windowHeight < SHORT_WINDOW_HEIGHT
      ? // A landscape phone or a split-screen half: the floor gives way so the sheet's first
        // heading, the coordinate line and the figure stay on screen.
        Math.min(available * MAP_HERO_FRACTION, Math.max(available - MAP_HERO_SHEET_RESERVE, 0))
      : Math.max(available * MAP_HERO_FRACTION, MAP_HERO_MIN_HEIGHT)
  )

  const handleStart = async () => {
    // The control is never disabled: a greyed pill over map tiles has no contrast guarantee,
    // so a blocked start says why instead.
    if (!settingsHydrated) {
      showAlert(t("dashboard.notReady.title"), t("dashboard.notReady.message"), "warning")
      return
    }
    if (isBatteryCritical) {
      showAlert(t("dashboard.batteryCritical.title"), t("dashboard.batteryCritical.message"), "warning")
      return
    }

    const locationOn = await NativeLocationService.isLocationEnabled()
    if (!locationOn) {
      const openSettings = await showConfirm({
        title: t("dashboard.locationServices.title"),
        message: t("dashboard.locationServices.message"),
        confirmText: t("dashboard.locationServices.confirm"),
        cancelText: t("dashboard.locationServices.cancel")
      })
      if (openSettings) {
        await NativeLocationService.openLocationSettings()
        return
      }
    }

    await startTracking()
    setTimeout(updateStats, 500)
  }

  const handleStop = async () => {
    await stopTracking()
    updateStats()
  }

  const updateStats = useCallback(async () => {
    try {
      const nativeStats = await NativeLocationService.getStats()

      const hasChanged =
        nativeStats.queued !== prevStats.current.queued ||
        nativeStats.sent !== prevStats.current.sent ||
        nativeStats.today !== prevStats.current.today

      if (hasChanged) {
        setStats(nativeStats)
        prevStats.current = nativeStats
      }
    } catch (err) {
      logger.error("[Dashboard] Failed to update stats:", err)
    }
  }, [])

  const updatePauseZone = useCallback(async () => {
    try {
      const result = await NativeLocationService.checkCurrentPauseZone()
      setCurrentPauseZone(result?.zoneName ?? null)
      setPauseReason(result?.pauseReason ?? null)
    } catch (err) {
      logger.error("[Dashboard] Failed to update pause zone:", err)
      setCurrentPauseZone(null)
      setPauseReason(null)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      updateStats()
      if (tracking) updatePauseZone()
      if (!tracking) {
        NativeLocationService.isBatteryCritical().then(setIsBatteryCritical)
      } else {
        setIsBatteryCritical(false)
      }
      NativeLocationService.isLocationEnabled().then(setLocationEnabled)

      const interval = tracking ? Math.max(settings.interval * 1000, MIN_STATS_INTERVAL_MS) : STATS_REFRESH_IDLE

      const statsTimer = setInterval(updateStats, interval)

      return () => {
        clearInterval(statsTimer)
      }
    }, [tracking, updateStats, updatePauseZone, settings.interval])
  )

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", updatePauseZone)
    return () => listener.remove()
  }, [updatePauseZone])

  useEffect(() => {
    const chargingListener = DeviceEventEmitter.addListener("onChargingStateChanged", () => {
      NativeLocationService.isBatteryCritical().then(setIsBatteryCritical)
    })
    return () => chargingListener.remove()
  }, [])

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener("onLocationStateChanged", (data: { locationEnabled: boolean }) => {
      if (data.locationEnabled) {
        logger.debug("[Dashboard] Location services enabled")
      } else {
        logger.warn("[Dashboard] Location services disabled - GPS will not produce fixes until re-enabled")
      }
      setLocationEnabled(data.locationEnabled)
    })
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        NativeLocationService.isLocationEnabled().then(setLocationEnabled)
      }
    })
    return () => {
      listener.remove()
      appStateSub.remove()
    }
  }, [])

  useEffect(() => {
    const pauseZoneListener = DeviceEventEmitter.addListener(
      "onPauseZoneChange",
      (data: { entered: boolean; zoneName: string | null; pauseReason: string | null }) => {
        if (data.entered) {
          setCurrentPauseZone(data.zoneName)
          setPauseReason(data.pauseReason)
        } else {
          setCurrentPauseZone(null)
          setPauseReason(null)
        }
      }
    )

    return () => pauseZoneListener.remove()
  }, [])

  return (
    <Container>
      <View testID="map-hero" style={[styles.map, { height: mapHeight }]}>
        <DashboardMap
          tracking={tracking}
          activeZoneName={currentPauseZone}
          pauseReason={pauseReason}
          activeProfileName={activeProfileName}
          isBatteryCritical={isBatteryCritical}
          locationEnabled={locationEnabled}
          interval={settings.interval}
        />
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <Card variant="sheet" style={styles.sheetBody}>
          {/* Welcome checklist (first run). Unhydrated settings read as a first run and cannot be dismissed. */}
          {settingsHydrated && !settings.hasCompletedSetup && (
            <WelcomeCard
              settings={settings}
              tracking={tracking}
              onDismiss={() =>
                setSettings({ ...settings, hasCompletedSetup: true }).catch((err) =>
                  logger.error("[DashboardScreen] Failed to dismiss welcome card:", err)
                )
              }
              onStartTracking={handleStart}
              onNavigateToConnection={() => navigation.navigate("Connection")}
              onNavigateToTrackingSync={() => navigation.navigate("Tracking & Sync")}
              onNavigateToApiConfig={() => navigation.navigate("API Config")}
            />
          )}

          {tracking && <CoordinateDisplay />}

          <Divider />

          <DatabaseStatistics stats={stats} />

          {!settings.isOfflineMode && (
            <>
              <Divider />
              <ConnectionStatus endpoint={settings.endpoint} navigation={navigation} />
            </>
          )}
        </Card>
      </ScrollView>

      <View style={[styles.pillSlot, { top: mapHeight - PILL_OVERHANG }]} pointerEvents="box-none">
        {tracking ? (
          <MapOverlay
            testID="tracking-toggle-btn"
            variant="control"
            shape="pill"
            onPress={handleStop}
            accessibilityLabel={t("dashboard.stop")}
          >
            <Square size={size.icon.md} color={colors.text} fill={colors.text} />
            <Text style={[styles.pillLabel, { color: colors.text }]}>{t("dashboard.stop")}</Text>
          </MapOverlay>
        ) : (
          <Button
            testID="tracking-toggle-btn"
            shape="pill"
            elevation={mode === "dark" ? 0 : elevation.floating}
            variant="primary"
            icon={Play}
            onPress={handleStart}
            title={t("dashboard.start")}
          />
        )}
      </View>
    </Container>
  )
}

const styles = StyleSheet.create({
  map: {
    width: "100%"
  },
  sheet: {
    flex: 1
  },
  sheetContent: {
    flexGrow: 1
  },
  sheetBody: {
    paddingTop: PILL_OVERHANG + space.sm,
    paddingBottom: space.xxl
  },
  pillSlot: {
    position: "absolute",
    start: 0,
    end: 0,
    alignItems: "center"
  },
  pillLabel: {
    ...text.bodyStrong
  }
})
