/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react"
import { DeviceEventEmitter } from "react-native"
import { Settings, DEFAULT_SETTINGS, LocationCoords, ApiTemplateName, HttpMethod } from "../types/global"
import { useLocationTracking } from "../hooks/useLocationTracking"
import NativeLocationService from "../services/NativeLocationService"
import SettingsService from "../services/SettingsService"
import { LocationDisclosureModal } from "../components/ui/LocationDisclosureModal"
import { LocalNetworkDisclosureModal } from "../components/ui/LocalNetworkDisclosureModal"
import { AppModal } from "../components/ui/AppModal"
import { checkPermissions } from "../services/LocationServicePermission"
import { logger } from "../utils/logger"

type TrackingContextType = {
  settings: Settings
  setSettings: (s: Settings) => Promise<void>
  updateSettingsLocal: (s: Settings) => void
  tracking: boolean
  isLoading: boolean
  error: Error | null
  activeProfileName: string | null
  startTracking: () => Promise<void>
  stopTracking: () => void
  restartTracking: (newSettings?: Settings) => Promise<void>
}

const TrackingContext = createContext<TrackingContextType | null>(null)
const CoordsContext = createContext<LocationCoords | null>(null)

/**
 * Parses raw SQLite settings (all strings) into typed Settings object
 */
function parseRawSettings(allRaw: Record<string, string>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    // Convert Android milliseconds back to seconds (UNIX-Timestamp)
    interval: allRaw.interval ? parseInt(allRaw.interval, 10) / 1000 : DEFAULT_SETTINGS.interval,

    distance: allRaw.minUpdateDistance ? parseFloat(allRaw.minUpdateDistance) : DEFAULT_SETTINGS.distance,

    syncInterval: allRaw.syncInterval ? parseInt(allRaw.syncInterval, 10) : DEFAULT_SETTINGS.syncInterval,

    retryInterval: allRaw.retryInterval ? parseInt(allRaw.retryInterval, 10) : DEFAULT_SETTINGS.retryInterval,

    maxRetries: allRaw.maxRetries ? parseInt(allRaw.maxRetries, 10) : DEFAULT_SETTINGS.maxRetries,

    accuracyThreshold: allRaw.accuracyThreshold
      ? parseFloat(allRaw.accuracyThreshold)
      : DEFAULT_SETTINGS.accuracyThreshold,

    isOfflineMode: allRaw.isOfflineMode === "true",
    isWifiOnlySync: allRaw.isWifiOnlySync === "true",
    endpoint: allRaw.endpoint ?? DEFAULT_SETTINGS.endpoint,
    syncPreset: (allRaw.syncPreset as any) ?? DEFAULT_SETTINGS.syncPreset,
    filterInaccurateLocations: allRaw.filterInaccurateLocations === "true",

    fieldMap: (() => {
      try {
        return allRaw.fieldMap ? JSON.parse(allRaw.fieldMap) : DEFAULT_SETTINGS.fieldMap
      } catch (err) {
        logger.warn("[TrackingContext] Corrupted fieldMap, using defaults:", err)
        return DEFAULT_SETTINGS.fieldMap
      }
    })(),

    customFields: (() => {
      try {
        return allRaw.customFields ? JSON.parse(allRaw.customFields) : DEFAULT_SETTINGS.customFields
      } catch (err) {
        logger.warn("[TrackingContext] Corrupted customFields, using defaults:", err)
        return DEFAULT_SETTINGS.customFields
      }
    })(),

    apiTemplate: (allRaw.apiTemplate as ApiTemplateName) ?? DEFAULT_SETTINGS.apiTemplate,
    httpMethod: (allRaw.httpMethod as HttpMethod) ?? DEFAULT_SETTINGS.httpMethod,

    hasCompletedSetup: allRaw.hasCompletedSetup === "true"
  }
}

/**
 * Global state management for location tracking, device coordinates, and application settings.
 *
 * This context serves as the "Single Source of Truth" for the entire Colota application,
 * bridging the gap between the persistent SQLite storage on Android and the React Native UI.
 *
 * **Core Responsibilities:**
 * 1. **Hydration:** On mount, it fetches raw settings from Native storage and transforms
 * them into a typed {@link Settings} object.
 * 2. **Persistence:** Synchronizes state changes back to the Native {@link SettingsService}
 * to ensure tracking behavior survives app restarts.
 * 3. **Tracking Control:** Provides unified methods to start, stop, and restart the
 * underlying GPS foreground service.
 */
export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null)

  // Ref to track if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true)

  // Ref to track if initialization has been done (prevents re-running on dependency changes)
  const hasInitializedRef = useRef(false)

  /**
   * Batch updates settings across both UI state and Native storage.
   * Wrapped in useCallback to maintain referential equality.
   */
  const setSettings = useCallback(async (newSettings: Settings) => {
    try {
      logger.debug("[TrackingContext] Batch syncing to Native storage...")
      // SettingsService handles unit conversion (seconds -> ms)
      await SettingsService.updateMultiple(newSettings)

      if (isMountedRef.current) {
        setSettingsState(newSettings)
        setError(null) // Clear any previous errors
      }
    } catch (err) {
      logger.error("[TrackingContext] Persistence failed:", err)
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
      throw err // Re-throw to allow caller to handle
    }
  }, [])

  const {
    coords,
    tracking,
    startTracking: internalStart,
    stopTracking: internalStop,
    restartTracking: internalRestart,
    reconnect: internalReconnect
  } = useLocationTracking(settings)

  /**
   * Initial Hydration Effect.
   * Performs a "Type Conversion Bridge" where SQLite results (which are always strings)
   * are parsed into their respective JS types (Numbers, Booleans, and JSON objects).
   */
  useEffect(() => {
    if (hasInitializedRef.current) return

    const init = async () => {
      try {
        logger.debug("[TrackingContext] Hydrating settings and state...")
        const allRaw = await NativeLocationService.getAllSettings()

        if (!isMountedRef.current) return

        // Initialize DB with defaults if empty
        if (Object.keys(allRaw).length === 0) {
          logger.debug("[TrackingContext] Initializing DB with defaults")
          await setSettings(DEFAULT_SETTINGS)
          return
        }

        // Parse settings from raw SQLite data
        const mergedSettings = parseRawSettings(allRaw)

        if (!isMountedRef.current) return
        setSettingsState(mergedSettings)

        // Auto-reconnect UI if tracking was active
        const isTrackingActive = allRaw.tracking_enabled === "true"
        if (isTrackingActive) {
          // Verify permission is still granted. Android kills the process
          // when permission is revoked, leaving tracking_enabled stale
          const perms = await checkPermissions()
          if (!perms.location) {
            logger.debug("[TrackingContext] Permission lost, clearing stale tracking state")
            await NativeLocationService.saveSetting("tracking_enabled", "false")
            return
          }

          logger.debug("[TrackingContext] Re-syncing UI with active background service")
          internalReconnect()

          // Restore active profile name from the running service
          const profileName = await NativeLocationService.getActiveProfileName()
          if (isMountedRef.current) {
            setActiveProfileName(profileName)
          }
        }
      } catch (err) {
        logger.error("[TrackingContext] Hydration failed:", err)
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
        hasInitializedRef.current = true
      }
    }

    init()

    // Safety timeout: force isLoading=false if init hangs
    const timeout = setTimeout(() => {
      if (isMountedRef.current && !hasInitializedRef.current) {
        logger.error("[TrackingContext] Initialization timed out after 5s, forcing ready state")
        setIsLoading(false)
        hasInitializedRef.current = true
      }
    }, 5000)

    // Cleanup function
    return () => {
      isMountedRef.current = false
      clearTimeout(timeout)
    }
  }, [internalReconnect, setSettings])

  // Listen for profile switch events from the native service
  useEffect(() => {
    const listener = DeviceEventEmitter.addListener("onProfileSwitch", (event) => {
      if (isMountedRef.current) {
        setActiveProfileName(event.profileName ?? null)
      }
    })
    return () => listener.remove()
  }, [])

  /**
   * Wrapped tracking controls with useCallback for stable references
   */
  const startTracking = useCallback(async () => {
    try {
      await internalStart(settings)
      if (isMountedRef.current) {
        setError(null)
      }
    } catch (err) {
      logger.error("[TrackingContext] Failed to start tracking:", err)
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
      throw err
    }
  }, [settings, internalStart])

  const stopTracking = useCallback(() => {
    try {
      internalStop()
      if (isMountedRef.current) {
        setActiveProfileName(null)
        setError(null)
      }
    } catch (err) {
      logger.error("[TrackingContext] Failed to stop tracking:", err)
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }, [internalStop])

  const restartTracking = useCallback(
    async (newSettings?: Settings) => {
      try {
        await internalRestart(newSettings || settings)
        if (isMountedRef.current) {
          setError(null)
        }
      } catch (err) {
        logger.error("[TrackingContext] Failed to restart tracking:", err)
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
        throw err
      }
    },
    [settings, internalRestart]
  )

  /**
   * Memoized context value to prevent unnecessary re-renders of consuming components.
   * Only updates when the actual values change.
   */
  const value = useMemo(
    () => ({
      settings,
      setSettings,
      updateSettingsLocal: setSettingsState,
      tracking,
      isLoading,
      error,
      activeProfileName,
      startTracking,
      stopTracking,
      restartTracking
    }),
    [settings, tracking, isLoading, error, activeProfileName, setSettings, startTracking, stopTracking, restartTracking]
  )

  return (
    <TrackingContext.Provider value={value}>
      <CoordsContext.Provider value={coords}>
        <LocationDisclosureModal />
        <LocalNetworkDisclosureModal />
        <AppModal />
        {children}
      </CoordsContext.Provider>
    </TrackingContext.Provider>
  )
}

/**
 * Custom hook to access tracking state and controls.
 * @throws {Error} If used outside of a {@link TrackingProvider}.
 * @returns {TrackingContextType} Current tracking state and controller functions.
 */
export function useTracking(): TrackingContextType {
  const context = useContext(TrackingContext)
  if (!context) {
    throw new Error("useTracking must be used within TrackingProvider")
  }
  return context
}

export function useCoords(): LocationCoords | null {
  return useContext(CoordsContext)
}
