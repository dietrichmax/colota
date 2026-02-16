/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { AppState, NativeEventEmitter, NativeModules } from "react-native"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { LocationCoords, Settings, LocationTrackingResult } from "../types/global"
import { ensurePermissions, checkPermissions } from "../services/LocationServicePermission"
import { logger } from "../utils/logger"

const { LocationServiceModule } = NativeModules
const locationEventEmitter = new NativeEventEmitter(LocationServiceModule)

/**
 * Hook for managing native location tracking.
 *
 * Acts as a bridge between React Native UI and Android Foreground Service.
 *
 * Features:
 * - Permission guards
 * - Native event subscription
 * - State hydration from SQLite
 * - Service restart logic with proper delays
 *
 * @param settings Initial tracking configuration
 * @returns Control interface for location tracking
 */
export function useLocationTracking(settings: Settings): LocationTrackingResult {
  // State
  const [coords, setCoords] = useState<LocationCoords | null>(null)
  const [tracking, setTracking] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)

  // Refs for synchronous checks
  const settingsRef = useRef<Settings>(settings)
  const isTrackingRef = useRef(false)
  const restartingRef = useRef(false)
  const restartQueuedRef = useRef(false)
  const listenerRef = useRef<any>(null)

  // Sync refs with state
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    isTrackingRef.current = tracking
  }, [tracking])

  /**
   * Fetches last known location from SQLite on mount
   * Prevents UI flicker before first GPS fix
   */
  useEffect(() => {
    const syncInitialLocation = async () => {
      if (!coords && (tracking || isRestarting)) {
        try {
          const latest = await NativeLocationService.getMostRecentLocation()
          if (latest) {
            setCoords({
              latitude: latest.latitude,
              longitude: latest.longitude,
              accuracy: latest.accuracy,
              altitude: latest.altitude ?? 0,
              speed: latest.speed ?? 0,
              bearing: latest.bearing ?? 0,
              timestamp: latest.timestamp ?? Date.now(),
              battery: latest.battery,
              battery_status: latest.batteryStatus
            })
          }
        } catch (err) {
          logger.error("[useLocationTracking] Failed to fetch initial location:", err)
        }
      }
    }

    syncInitialLocation()
  }, [tracking, isRestarting, coords])

  /**
   * Fetches latest location from DB when app returns to foreground.
   * Native events are suppressed while backgrounded, so coords go stale.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active" || !isTrackingRef.current) return

      try {
        // Verify permission still granted (user may have revoked it in Settings)
        const perms = await checkPermissions()
        if (!perms.location) {
          logger.warn("[useLocationTracking] Permission revoked — stopping tracking")
          if (listenerRef.current) {
            listenerRef.current.remove()
            listenerRef.current = null
          }
          NativeLocationService.stop()
          setTracking(false)
          setCoords(null)
          showAlert("Tracking Stopped", "Location permission was revoked.", "warning")
          return
        }

        const latest = await NativeLocationService.getMostRecentLocation()
        if (latest) {
          setCoords({
            latitude: latest.latitude,
            longitude: latest.longitude,
            accuracy: latest.accuracy,
            altitude: latest.altitude ?? 0,
            speed: latest.speed ?? 0,
            bearing: latest.bearing ?? 0,
            timestamp: latest.timestamp ?? Date.now(),
            battery: latest.battery,
            battery_status: latest.batteryStatus
          })
        }
      } catch (err) {
        logger.error("[useLocationTracking] Failed to fetch location on resume:", err)
      }
    })

    return () => subscription.remove()
  }, [])

  /**
   * Subscribes to real-time location updates from native service
   */
  useEffect(() => {
    if (tracking && !listenerRef.current) {
      logger.debug("[useLocationTracking] Attaching native listener")
      listenerRef.current = locationEventEmitter.addListener("onLocationUpdate", (event: any) => {
        setCoords({
          latitude: event.latitude,
          longitude: event.longitude,
          accuracy: event.accuracy,
          altitude: event.altitude,
          speed: event.speed,
          bearing: event.bearing,
          timestamp: event.timestamp,
          battery: event.battery,
          battery_status: event.batteryStatus
        })
      })
    }

    return () => {
      if (listenerRef.current) {
        logger.debug("[useLocationTracking] Detaching native listener")
        listenerRef.current.remove()
        listenerRef.current = null
      }
    }
  }, [tracking])

  /**
   * Listens for unexpected tracking stops (e.g. battery critical)
   */
  useEffect(() => {
    const sub = locationEventEmitter.addListener("onTrackingStopped", (event: { reason: string }) => {
      logger.warn(`[useLocationTracking] Tracking stopped by native: ${event.reason}`)
      if (listenerRef.current) {
        listenerRef.current.remove()
        listenerRef.current = null
      }
      setTracking(false)
      setCoords(null)
    })
    return () => sub.remove()
  }, [])

  /**
   * Listens for sync errors from native service
   */
  useEffect(() => {
    const sub = locationEventEmitter.addListener("onSyncError", (event: { message: string; queuedCount: number }) => {
      logger.warn(`[useLocationTracking] Sync error: ${event.message} (${event.queuedCount} queued)`)
    })
    return () => sub.remove()
  }, [])

  /**
   * Starts location tracking
   * @param overrideSettings Optional one-time settings override
   */
  const startTracking = useCallback(async (overrideSettings?: Settings) => {
    if (isTrackingRef.current) {
      logger.debug("[useLocationTracking] Already tracking")
      return
    }

    const effectiveSettings: Settings = {
      ...settingsRef.current,
      ...overrideSettings
    }

    const granted = await ensurePermissions()
    if (!granted) {
      showAlert("Permission Required", "Background location permission is required for tracking.", "warning")
      return
    }

    setTracking(true)

    try {
      await NativeLocationService.start(effectiveSettings)
      logger.debug(`[useLocationTracking] Service started (offline: ${effectiveSettings.isOfflineMode})`)
    } catch (error) {
      setTracking(false)
      logger.error("[useLocationTracking] Failed to start:", error)
      showAlert("Error", "Failed to start location tracking.", "error")
    }
  }, [])

  /**
   * Stops location tracking and cleans up
   */
  const stopTracking = useCallback(() => {
    if (!isTrackingRef.current) {
      logger.debug("[useLocationTracking] Not tracking")
      return
    }

    logger.debug("[useLocationTracking] Stopping service")

    if (listenerRef.current) {
      listenerRef.current.remove()
      listenerRef.current = null
    }

    NativeLocationService.stop()
    setTracking(false)
    setCoords(null)
  }, [])

  /**
   * Restarts the service with new settings
   * Includes delay for Android to release foreground service resources
   * @param newSettings Settings for the new service instance
   */
  const restartTracking = useCallback(
    async (newSettings?: Settings) => {
      if (restartingRef.current) {
        logger.debug("[useLocationTracking] Restart already in progress, queuing")
        restartQueuedRef.current = true
        return
      }

      logger.debug("[useLocationTracking] Restarting service")
      setIsRestarting(true)
      restartingRef.current = true

      try {
        stopTracking()

        // Android requires delay to fully release foreground service
        await new Promise<void>((resolve) => setTimeout(resolve, 500))

        await startTracking(newSettings ?? settingsRef.current)
      } finally {
        restartingRef.current = false
        setIsRestarting(false)

        // Process queued restart if any
        if (restartQueuedRef.current) {
          restartQueuedRef.current = false
          logger.debug("[useLocationTracking] Processing queued restart")
          setTimeout(() => restartTracking(newSettings), 100)
        }
      }
    },
    [startTracking, stopTracking]
  )

  /**
   * Reconnects React state to an already-running native service.
   * Used after app restart when tracking_enabled is true in the DB.
   * Does NOT request permissions or restart the service.
   */
  const reconnect = useCallback(async () => {
    if (isTrackingRef.current) {
      logger.debug("[useLocationTracking] Already tracking, skip reconnect")
      return
    }

    logger.debug("[useLocationTracking] Reconnecting to active service")
    setTracking(true)

    try {
      const latest = await NativeLocationService.getMostRecentLocation()
      if (latest) {
        setCoords({
          latitude: latest.latitude,
          longitude: latest.longitude,
          accuracy: latest.accuracy,
          altitude: latest.altitude ?? 0,
          speed: latest.speed ?? 0,
          bearing: latest.bearing ?? 0,
          timestamp: latest.timestamp ?? Date.now(),
          battery: latest.battery,
          battery_status: latest.batteryStatus
        })
      }
    } catch (err) {
      logger.error("[useLocationTracking] Failed to fetch location on reconnect:", err)
    }
  }, [])

  /**
   * Cleanup on unmount
   * NOTE: Does NOT stop tracking - service continues in background
   */
  useEffect(() => {
    return () => {
      logger.debug("[useLocationTracking] Component unmounted, service remains active")
      restartQueuedRef.current = false
      restartingRef.current = false
    }
  }, [])

  return {
    coords,
    tracking: tracking || isRestarting,
    startTracking,
    stopTracking,
    restartTracking,
    reconnect,
    settings
  }
}
