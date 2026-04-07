/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { AppState } from "react-native"
import NativeLocationService from "../services/NativeLocationService"
import type { TrackLocation } from "../components/features/map/mapUtils"
import type { LocationCoords } from "../types/global"
import { logger } from "../utils/logger"

/** How often to bump the version counter (ms) to batch GeoJSON rebuilds. */
const FLUSH_INTERVAL_MS = 5000

function startOfDayUnix(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function todayDateStr(): string {
  const d = new Date()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${d.getFullYear()}-${m < 10 ? "0" : ""}${m}-${day < 10 ? "0" : ""}${day}`
}

/**
 * Loads today's tracked locations and incrementally appends new ones
 * from the coords context. Returns a stable ref array + a version
 * counter for memoization.
 */
export function useTodayTrack(tracking: boolean, coords: LocationCoords | null) {
  const locationsRef = useRef<TrackLocation[]>([])
  const [version, setVersion] = useState(0)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasPendingPoints = useRef(false)
  const lastTimestampRef = useRef(0)
  const loadedDayRef = useRef("")

  const flush = useCallback(() => {
    flushTimer.current = null
    if (hasPendingPoints.current) {
      hasPendingPoints.current = false
      setVersion((v) => v + 1)
    }
  }, [])

  const scheduleFlush = useCallback(() => {
    hasPendingPoints.current = true
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(flush, FLUSH_INTERVAL_MS)
    }
  }, [flush])

  // Load today's locations from DB
  const loadFromDb = useCallback(async (since?: number) => {
    try {
      const start = since ?? startOfDayUnix()
      const end = Math.floor(Date.now() / 1000)
      const rows = await NativeLocationService.getLocationsByDateRange(start, end)
      const mapped: TrackLocation[] = (rows || []).map((r: any) => ({
        latitude: r.latitude,
        longitude: r.longitude,
        timestamp: r.timestamp,
        accuracy: r.accuracy,
        speed: r.speed,
        altitude: r.altitude
      }))

      if (since) {
        // Incremental: append only points newer than the cutoff.
        const cutoff = since
        for (const loc of mapped) {
          if (loc.timestamp && loc.timestamp > cutoff) {
            locationsRef.current.push(loc)
          }
        }
      } else {
        // Full load: merge any points appended by coords during the await
        const pendingCutoff = mapped.length > 0 ? (mapped[mapped.length - 1].timestamp ?? 0) : 0
        const pendingPoints = locationsRef.current.filter((loc) => (loc.timestamp ?? 0) > pendingCutoff)
        locationsRef.current = mapped.concat(pendingPoints)
        loadedDayRef.current = todayDateStr()
      }

      if (locationsRef.current.length > 0) {
        const last = locationsRef.current[locationsRef.current.length - 1]
        lastTimestampRef.current = last.timestamp ?? end
      }

      setVersion((v) => v + 1)
    } catch (err) {
      logger.error("[useTodayTrack] Failed to load locations:", err)
    }
  }, [])

  // Initial load + day rollover check
  useEffect(() => {
    if (!tracking) {
      locationsRef.current = []
      lastTimestampRef.current = 0
      loadedDayRef.current = ""
      setVersion((v) => v + 1)
      return
    }
    loadFromDb()
  }, [tracking, loadFromDb])

  // Append new points from coords context changes
  useEffect(() => {
    if (!tracking || !coords || !coords.timestamp) return

    // Day rollover: reset if date changed
    const today = todayDateStr()
    if (loadedDayRef.current && loadedDayRef.current !== today) {
      locationsRef.current = []
      lastTimestampRef.current = 0
      loadedDayRef.current = today
    }

    // Skip if this timestamp was already recorded
    if (coords.timestamp <= lastTimestampRef.current) return

    locationsRef.current.push({
      latitude: coords.latitude,
      longitude: coords.longitude,
      timestamp: coords.timestamp,
      accuracy: coords.accuracy,
      speed: coords.speed,
      altitude: coords.altitude
    })
    lastTimestampRef.current = coords.timestamp
    scheduleFlush()
  }, [tracking, coords, scheduleFlush])

  // Catch up on locations missed while backgrounded (incremental)
  useEffect(() => {
    if (!tracking) return

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && lastTimestampRef.current > 0) {
        loadFromDb(lastTimestampRef.current)
      } else if (state === "active") {
        loadFromDb()
      }
    })

    return () => sub.remove()
  }, [tracking, loadFromDb])

  // Cleanup flush timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimer.current) {
        clearTimeout(flushTimer.current)
        flushTimer.current = null
      }
    }
  }, [])

  return { locations: locationsRef.current, version }
}
