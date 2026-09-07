/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react"
import { StyleSheet, View, DeviceEventEmitter, AppState, StatusBar, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useFocusEffect, useIsFocused } from "@react-navigation/native"
import { SavedTrackingProfile, ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { checkPermissions, ensurePermissions, PermissionStatus } from "../services/LocationServicePermission"
import { useTracking, useCoords } from "../contexts/TrackingProvider"
import { showConfirm } from "../services/modalService"
import { Button, Container, DashboardBanner, DashboardDock, DashboardMap } from "../components"
import type { LastKnownLocation } from "../components/features/dashboard/DashboardMap"
import { TrackToggleButton } from "../components/features/map/TrackToggleButton"
import { intervalText, pickBannerCondition } from "../utils/dashboardState"
import { size, space } from "../constants"
import { Square, Play } from "lucide-react-native"
import { logger } from "../utils/logger"

export function DashboardScreen({ navigation }: ScreenProps) {
  const {
    settings,
    tracking,
    startTracking,
    stopTracking,
    setSettings,
    activeProfileName,
    activeProfileId,
    settingsHydrated
  } = useTracking()
  const coords = useCoords()
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const isFocused = useIsFocused()

  // Hiding the header is safe on a tab root: the tab bar stays as the way out.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false })
  }, [navigation])

  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)
  const [pauseReason, setPauseReason] = useState<string | null>(null)
  const [isBatteryCritical, setIsBatteryCritical] = useState(false)
  const [locationEnabled, setLocationEnabled] = useState(true)
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null)
  const [lastKnown, setLastKnown] = useState<LastKnownLocation | null | undefined>(undefined)
  const [stoppedByBattery, setStoppedByBattery] = useState(false)
  const [showTrack, setShowTrack] = useState<boolean | null>(null)
  const [hasTrack, setHasTrack] = useState(false)
  const [activeProfile, setActiveProfile] = useState<SavedTrackingProfile | null>(null)
  const [stackHeight, setStackHeight] = useState(0)
  const [bannerHeight, setBannerHeight] = useState(0)
  const [recentreSignal, setRecentreSignal] = useState(0)

  const handleStart = async () => {
    const locationOn = await NativeLocationService.isLocationEnabled()
    if (!locationOn) {
      const openSettings = await showConfirm({
        title: "Please enable Location Services",
        message: "Location Services are disabled. Tracking will not work until they are enabled in Settings.",
        confirmText: "Location settings",
        cancelText: "Start anyway"
      })
      if (openSettings) {
        await NativeLocationService.openLocationSettings()
        return
      }
    }
    setRecentreSignal((n) => n + 1)
    await startTracking()
  }

  const handleStop = async () => {
    await stopTracking()
  }

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

  const refreshPermissions = useCallback(() => {
    checkPermissions()
      .then(setPermissions)
      .catch((err) => logger.error("[Dashboard] Failed to check permissions:", err))
  }, [])

  useEffect(() => {
    NativeLocationService.getSetting("showTrack")
      .then((val) => setShowTrack(val === "true"))
      .catch((err) => {
        logger.error("[Dashboard] Failed to load showTrack setting:", err)
        setShowTrack(false)
      })
  }, [])

  useEffect(() => {
    if (activeProfileId === null) {
      setActiveProfile(null)
      return
    }
    let cancelled = false
    NativeLocationService.getProfiles()
      .then((profiles) => {
        if (!cancelled) setActiveProfile(profiles.find((p) => p.id === activeProfileId) ?? null)
      })
      .catch((err) => logger.error("[Dashboard] Failed to resolve the active profile:", err))
    return () => {
      cancelled = true
    }
  }, [activeProfileId])

  useFocusEffect(
    useCallback(() => {
      if (tracking) {
        updatePauseZone()
        setIsBatteryCritical(false)
      } else {
        NativeLocationService.isBatteryCritical().then(setIsBatteryCritical)
        NativeLocationService.getMostRecentLocation()
          .then((latest) =>
            setLastKnown(
              latest
                ? {
                    latitude: latest.latitude,
                    longitude: latest.longitude,
                    accuracy: latest.accuracy ?? 0,
                    timestamp: latest.timestamp
                  }
                : null
            )
          )
          .catch((err) => logger.error("[Dashboard] Failed to read the last known location:", err))
        NativeLocationService.getSetting("stopped_by_battery")
          .then((val) => setStoppedByBattery(val === "true"))
          .catch((err) => logger.error("[Dashboard] Failed to read stopped_by_battery:", err))
      }
      NativeLocationService.isLocationEnabled().then(setLocationEnabled)
      refreshPermissions()
    }, [tracking, updatePauseZone, refreshPermissions])
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
        refreshPermissions()
      }
    })
    return () => {
      listener.remove()
      appStateSub.remove()
    }
  }, [refreshPermissions])

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

  const bannerCondition = pickBannerCondition({ permissions, locationEnabled, isBatteryCritical, tracking })

  const handleBannerAction = useCallback(() => {
    if (bannerCondition === "locationOff") {
      NativeLocationService.openLocationSettings()
      return
    }
    ensurePermissions()
      .then(refreshPermissions)
      .catch((err) => logger.error("[Dashboard] Failed to request permissions:", err))
  }, [bannerCondition, refreshPermissions])

  const toggleTrack = useCallback(() => {
    const next = !showTrack
    setShowTrack(next)
    NativeLocationService.saveSetting("showTrack", String(next)).catch((err) =>
      logger.error("[Dashboard] Failed to save showTrack setting:", err)
    )
  }, [showTrack])

  const bannerInset = bannerCondition && bannerHeight ? bannerHeight + space.md : 0
  const edgeStart = space.lg + insets.left
  const edgeEnd = space.lg + insets.right
  const cameraPadding = useMemo(
    () => ({
      top: insets.top + bannerInset + space.lg,
      bottom: stackHeight + space.lg + space.lg,
      left: edgeStart,
      right: edgeEnd + size.iconColumn + space.lg
    }),
    [insets.top, bannerInset, stackHeight, edgeStart, edgeEnd]
  )
  const controlsBottom = space.lg + stackHeight + space.sm

  const hasFix = tracking && coords !== null && coords.latitude !== 0 && coords.longitude !== 0
  const dockCoords = hasFix ? { accuracy: coords.accuracy ?? 0, timestamp: coords.timestamp ?? 0 } : null
  const intervalRow = activeProfile
    ? intervalText(activeProfile.interval, activeProfile.syncInterval)
    : intervalText(settings.interval, settings.syncInterval)

  return (
    <Container>
      {isFocused && <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />}

      <DashboardMap
        tracking={tracking}
        activeZoneName={currentPauseZone}
        lastKnown={lastKnown}
        cameraPadding={cameraPadding}
        controlsBottom={controlsBottom}
        controlsEnd={edgeEnd}
        showTrack={!!showTrack}
        onHasTrackChange={setHasTrack}
        recentreSignal={recentreSignal}
      />

      {bannerCondition && (
        <DashboardBanner
          condition={bannerCondition}
          onAction={handleBannerAction}
          top={insets.top + space.md}
          left={edgeStart}
          right={edgeEnd}
          onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}
        />
      )}

      <View
        style={[styles.stack, { left: edgeStart, right: edgeEnd }]}
        pointerEvents="box-none"
        onLayout={(e) => setStackHeight(e.nativeEvent.layout.height)}
        testID="dashboard-stack"
      >
        <View style={styles.actionRow} pointerEvents="box-none">
          <View style={styles.routeSlot} testID="route-slot">
            {showTrack !== null && (tracking || hasTrack) && (
              <TrackToggleButton anchored={false} active={showTrack} onPress={toggleTrack} />
            )}
          </View>
          <Button
            shape="pill"
            floating
            variant={tracking ? "danger" : "primary"}
            icon={tracking ? Square : Play}
            onPress={tracking ? handleStop : handleStart}
            loading={!settingsHydrated}
            disabled={!tracking && isBatteryCritical}
            title={tracking ? "Stop tracking" : "Start tracking"}
          />
        </View>

        <DashboardDock
          tracking={tracking}
          hasFix={hasFix}
          locationEnabled={locationEnabled}
          activeZoneName={currentPauseZone}
          pauseReason={pauseReason}
          activeProfileName={activeProfileName}
          coords={dockCoords}
          lastKnown={lastKnown ?? null}
          stoppedByBattery={stoppedByBattery}
          intervalText={intervalRow}
          endpoint={settings.endpoint}
          isOfflineMode={settings.isOfflineMode}
          navigation={navigation}
          maxHeight={windowHeight / 2}
          firstRun={settingsHydrated && !settings.hasCompletedSetup}
          settings={settings}
          colors={colors}
          onDismiss={() =>
            setSettings({ ...settings, hasCompletedSetup: true }).catch((err) =>
              logger.error("[DashboardScreen] Failed to dismiss welcome card:", err)
            )
          }
          onStartTracking={handleStart}
          onNavigateToConnection={() => navigation.navigate("Connection")}
          onNavigateToTrackingSync={() => navigation.navigate("Tracking & Sync")}
          onNavigateToRequestFormat={() => navigation.navigate("Request Format")}
        />
      </View>
    </Container>
  )
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    bottom: space.lg,
    flexDirection: "column",
    gap: space.sm
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between"
  },
  routeSlot: {
    width: size.iconColumn,
    marginBottom: space.sm
  }
})
