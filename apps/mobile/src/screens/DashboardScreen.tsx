/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useState, useCallback, useRef } from "react"
import { StyleSheet, View, ScrollView, DeviceEventEmitter, Animated } from "react-native"
import { ScreenProps, DatabaseStats } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { useFocusEffect } from "@react-navigation/native"
import {
  Button,
  ServerConnection,
  DashboardMap,
  CoordinateDisplay,
  Container,
  QuickAccess,
  DatabaseStatistics,
  WelcomeCard
} from "../components"
import { STATS_REFRESH_IDLE, MIN_STATS_INTERVAL_MS } from "../constants"
import { Square, Play } from "lucide-react-native"
import { logger } from "../utils/logger"

export function DashboardScreen({ navigation }: ScreenProps) {
  const { coords, settings, tracking, startTracking, stopTracking, setSettings, activeProfileName } = useTracking()
  const { colors } = useTheme()

  const [stats, setStats] = useState<DatabaseStats>({
    queued: 0,
    sent: 0,
    total: 0,
    today: 0,
    databaseSizeMB: 0
  })

  const prevStats = useRef(stats)
  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)
  const [scrollEnabled, setScrollEnabled] = useState(true)

  // Animation for button
  const buttonScale = useRef(new Animated.Value(1)).current

  const handleStart = async () => {
    // Bounce animation
    Animated.sequence([
      Animated.spring(buttonScale, {
        toValue: 0.92,
        useNativeDriver: true
      }),
      Animated.spring(buttonScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 3
      })
    ]).start()

    await startTracking()
    setTimeout(updateStats, 500)
  }

  const handleStop = async () => {
    Animated.sequence([
      Animated.spring(buttonScale, {
        toValue: 0.92,
        useNativeDriver: true
      }),
      Animated.spring(buttonScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 3
      })
    ]).start()

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
      const zoneName = await NativeLocationService.checkCurrentPauseZone()
      setCurrentPauseZone(zoneName)
    } catch (err) {
      logger.error("[Dashboard] Failed to update pause zone:", err)
      setCurrentPauseZone(null)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      updateStats()
      updatePauseZone()

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
    const pauseZoneListener = DeviceEventEmitter.addListener(
      "onPauseZoneChange",
      (data: { entered: boolean; zoneName: string | null }) => {
        if (data.entered) {
          setCurrentPauseZone(data.zoneName)
        } else {
          setCurrentPauseZone(null)
        }
      }
    )

    return () => pauseZoneListener.remove()
  }, [])

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        {/* Map Section */}
        <View style={styles.mapSection}>
          <View
            style={styles.mapWrapper}
            onTouchStart={() => setScrollEnabled(false)}
            onTouchEnd={() => setScrollEnabled(true)}
          >
            <DashboardMap
              coords={coords}
              tracking={tracking}
              activeZoneName={currentPauseZone}
              activeProfileName={activeProfileName}
            />
          </View>

          {/* Tracking Control Button */}
          <Animated.View
            style={[styles.controlButtonContainer, { transform: [{ scale: buttonScale }] }]}
            pointerEvents="box-none"
          >
            <Button
              style={styles.controlButton}
              variant={tracking ? "danger" : "primary"}
              icon={tracking ? Square : Play}
              onPress={tracking ? handleStop : handleStart}
              activeOpacity={0.9}
              title={tracking ? "Stop Tracking" : "Start Tracking"}
            />
          </Animated.View>
        </View>

        {/* Content Section */}
        <View style={[styles.content, { backgroundColor: colors.background }]}>
          {/* Welcome Card (first run) */}
          {!settings.hasCompletedSetup && (
            <WelcomeCard
              settings={settings}
              tracking={tracking}
              colors={colors}
              onDismiss={() => setSettings({ ...settings, hasCompletedSetup: true })}
              onStartTracking={handleStart}
              onNavigateToSettings={() => navigation.navigate("Settings")}
              onNavigateToApiConfig={() => navigation.navigate("API Config")}
            />
          )}

          {/* Coordinates */}
          {tracking && coords && (
            <View style={styles.metricsSection}>
              <CoordinateDisplay coords={coords} />
            </View>
          )}

          {/* Stats Cards */}
          <DatabaseStatistics stats={stats} />

          {/* Server Connection */}
          <ServerConnection endpoint={settings.endpoint} navigation={navigation} />

          {/* Quick Access */}
          <QuickAccess navigation={navigation} />
        </View>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1
  },
  mapSection: {
    height: 480,
    position: "relative"
  },
  mapWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  controlButtonContainer: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center"
  },
  controlButton: {
    borderRadius: 28,
    elevation: 4,
    minWidth: 200,
    shadowColor: "#000"
  },
  content: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  metricsSection: {
    marginBottom: 20
  }
})
