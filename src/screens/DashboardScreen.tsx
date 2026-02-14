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
  DatabaseStatistics
} from "../components"
import { STATS_REFRESH_IDLE } from "../constants"

export function DashboardScreen({ navigation }: ScreenProps) {
  const { coords, settings, tracking, startTracking, stopTracking } = useTracking()
  const { colors } = useTheme()

  const [stats, setStats] = useState<DatabaseStats>({
    queued: 0,
    sent: 0,
    total: 0,
    today: 0,
    databaseSizeMB: 0
  })

  const prevStats = useRef(stats)
  const [currentSilentZone, setCurrentSilentZone] = useState<string | null>(null)
  const [scrollEnabled, setScrollEnabled] = useState(true)

  // Animation for button
  const buttonScale = useRef(new Animated.Value(1)).current

  const isInSilentZone = !!currentSilentZone

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
      console.error("[Dashboard] Failed to update stats:", err)
    }
  }, [])

  const updateSilentZone = useCallback(async () => {
    try {
      const zoneName = await NativeLocationService.checkCurrentSilentZone()
      setCurrentSilentZone(zoneName)
    } catch (err) {
      console.error("[Dashboard] Failed to update silent zone:", err)
      setCurrentSilentZone(null)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      updateStats()
      updateSilentZone()

      const interval = tracking ? Math.max(settings.interval * 1000, 2000) : STATS_REFRESH_IDLE

      const statsTimer = setInterval(updateStats, interval)

      return () => {
        clearInterval(statsTimer)
      }
    }, [tracking, updateStats, updateSilentZone, settings.interval])
  )

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", updateSilentZone)
    return () => listener.remove()
  }, [updateSilentZone])

  useEffect(() => {
    const silentZoneListener = DeviceEventEmitter.addListener(
      "onSilentZoneChange",
      (data: { entered: boolean; zoneName: string | null }) => {
        if (data.entered) {
          setCurrentSilentZone(data.zoneName)
        } else {
          setCurrentSilentZone(null)
        }
      }
    )

    return () => silentZoneListener.remove()
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
              isPaused={isInSilentZone}
              activeZoneName={currentSilentZone}
            />
          </View>

          {/* Tracking Control Button */}
          <Animated.View
            style={[styles.controlButtonContainer, { transform: [{ scale: buttonScale }] }]}
            pointerEvents="box-none"
          >
            <Button
              style={[
                styles.controlButton,
                {
                  backgroundColor: tracking ? colors.error : colors.primary,
                  shadowColor: tracking ? colors.error : colors.primary
                }
              ]}
              color="#f8f7f7"
              onPress={tracking ? handleStop : handleStart}
              activeOpacity={0.9}
              title={tracking ? "■ Stop Tracking" : "▶ Start Tracking"}
            />
          </Animated.View>
        </View>

        {/* Content Section */}
        <View style={[styles.content, { backgroundColor: colors.background }]}>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 28,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    minWidth: 200
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
