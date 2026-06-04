/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react"
import { View, Text, StyleSheet, Pressable } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { fonts } from "../styles/typography"
import { BarChart2 } from "lucide-react-native"
import { Container } from "../components"
import { Tab } from "../components/ui/Tab"
import { useTheme } from "../hooks/useTheme"
import { Trip, LocationCoords } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { CalendarPicker } from "../components/features/inspector/CalendarPicker"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { TripList } from "../components/features/inspector/TripList"
import { LocationTable } from "../components/features/inspector/LocationTable"
import { formatDistance, startOfDaySec, endOfDaySec } from "../utils/geo"
import { pad2 } from "../utils/format"
import { segmentTrips, getTripColor } from "../utils/trips"
import { EXPORT_FORMATS, type ExportFormat } from "../utils/exportConverters"
import { showAlert, showConfirm } from "../services/modalService"
import type { RootScreenProps } from "../types/navigation"

type TabType = "map" | "trips" | "data"

export function LocationHistoryScreen({ navigation, route }: RootScreenProps<"Location History">) {
  const { colors } = useTheme()
  const [activeTab, setActiveTab] = useState<TabType>(route?.params?.initialTab ?? "map")

  // Map tab state - accept initialDate from Summary screen navigation
  const [mapDate, setMapDate] = useState(() => {
    const initialDate = route?.params?.initialDate
    return initialDate ? new Date(initialDate) : new Date()
  })
  const [trackLocations, setTrackLocations] = useState<LocationCoords[]>([])
  // Note edits, kept out of trackLocations so a save doesn't hand the map a new array (which would
  // re-render it). Used only by the Data tab; the map reads notes through its own overlay.
  const [noteOverrides, setNoteOverrides] = useState<Record<number, string | undefined>>({})
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [fitVersion, setFitVersion] = useState(0)

  // Calendar state
  const [daysWithData, setDaysWithData] = useState<Set<string>>(new Set())
  const daysCache = useRef<Map<string, Set<string>>>(new Map())
  const distanceCache = useRef<Map<string, Map<string, number>>>(new Map())

  // Trip segmentation from already-fetched day data
  const trips = useMemo(() => segmentTrips(trackLocations), [trackLocations])

  // Sum of per-trip distances (excludes gap jumps between trips)
  const dailyDistance = useMemo(() => {
    if (trips.length === 0) return undefined
    const meters = trips.reduce((sum, t) => sum + t.distance, 0)
    return meters > 0 ? formatDistance(meters) : undefined
  }, [trips])

  const fetchTrackIdRef = useRef(0)

  // Summary navigation button
  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={() => navigation.navigate("Location Summary")}
        style={({ pressed }) => [styles.headerBtn, pressed && { opacity: colors.pressedOpacity }]}
      >
        <BarChart2 size={20} color={colors.text} />
      </Pressable>
    ),
    [navigation, colors]
  )

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight })
  }, [navigation, headerRight])

  /** Fetch days-with-data and daily distances for a month into cache. */
  const prefetchMonth = useCallback(async (year: number, month: number): Promise<Set<string>> => {
    const key = `${year}-${pad2(month + 1)}`
    if (daysCache.current.has(key)) return daysCache.current.get(key)!
    try {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59)
      const startTs = Math.floor(start.getTime() / 1000)
      const endTs = Math.floor(end.getTime() / 1000)
      const [days, stats] = await Promise.all([
        NativeLocationService.getDaysWithData(startTs, endTs),
        NativeLocationService.getDailyStats(startTs, endTs)
      ])
      const daySet = new Set(days)
      daysCache.current.set(key, daySet)
      const distances = new Map<string, number>()
      for (const stat of stats) {
        if (stat.distanceMeters > 0) distances.set(stat.day, stat.distanceMeters)
      }
      distanceCache.current.set(key, distances)
      return daySet
    } catch (err) {
      logger.error("[LocationHistory] Failed to fetch days with data:", err)
      return new Set()
    }
  }, [])

  /** Fetch and display days with data for a given month */
  const fetchDaysWithData = useCallback(
    async (year: number, month: number) => {
      const daySet = await prefetchMonth(year, month)
      setDaysWithData(daySet)
    },
    [prefetchMonth]
  )

  // Fetch days for current month on mount and when date changes month
  useEffect(() => {
    fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
  }, [mapDate, fetchDaysWithData])

  /** Fetch track data for the selected day */
  const fetchTrackData = useCallback(async () => {
    const id = ++fetchTrackIdRef.current
    try {
      const startTimestamp = startOfDaySec(mapDate)
      const endTimestamp = endOfDaySec(mapDate)

      const result = await NativeLocationService.getLocationsByDateRange(startTimestamp, endTimestamp)
      if (id === fetchTrackIdRef.current) {
        setTrackLocations(result || [])
        setNoteOverrides({})
        setSelectedTrip(null)
        setFitVersion((v) => v + 1)
      }
    } catch (err) {
      logger.error("[LocationHistory] Track fetch error:", err)
      if (id === fetchTrackIdRef.current) {
        setTrackLocations([])
        setNoteOverrides({})
        setSelectedTrip(null)
        setFitVersion((v) => v + 1)
      }
    }
  }, [mapDate])

  /** Fetch track data when map date changes */
  useEffect(() => {
    fetchTrackData()
  }, [fetchTrackData])

  /** Refresh on focus so trip deletions in TripDetail are reflected */
  useFocusEffect(
    useCallback(() => {
      const key = `${mapDate.getFullYear()}-${pad2(mapDate.getMonth() + 1)}`
      daysCache.current.delete(key)
      distanceCache.current.delete(key)
      fetchTrackData()
      fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
    }, [fetchTrackData, fetchDaysWithData, mapDate])
  )

  /** Tap a trip card -> open detail screen */
  const handleTripSelect = useCallback(
    (trip: Trip) => {
      navigation.navigate("Trip Detail", { trip, trips })
    },
    [navigation, trips]
  )

  /** Export trips (all or single) */
  const exportTrips = useCallback(
    async (format: ExportFormat, tripsToExport: Trip[]) => {
      if (tripsToExport.length === 0) return
      try {
        const dateStr = mapDate.toISOString().slice(0, 10)
        const isSingle = tripsToExport.length === 1
        const label = isSingle ? `Trip ${tripsToExport[0].index}` : "Trips"
        const fileName = `colota_${isSingle ? `trip${tripsToExport[0].index}` : "trips"}_${dateStr}${
          EXPORT_FORMATS[format].extension
        }`
        const filePath = await NativeLocationService.exportTripsToFile(
          tripsToExport.map((t) => ({
            index: t.index,
            color: getTripColor(t.index),
            startTs: t.startTime,
            endTs: t.endTime
          })),
          format,
          fileName
        )
        await NativeLocationService.shareFile(filePath, EXPORT_FORMATS[format].mimeType, `Colota ${label} - ${dateStr}`)
      } catch (error) {
        logger.error("[LocationHistory] Trip export failed:", error)
        showAlert("Export Failed", "Unable to export. Please try again.", "error")
      }
    },
    [mapDate]
  )

  const handleShowFullDay = useCallback(() => {
    setSelectedTrip(null)
    setFitVersion((v) => v + 1)
  }, [])

  const handleDeleteTrips = useCallback(
    async (toDelete: Trip[]) => {
      if (toDelete.length === 0) return
      const totalPoints = toDelete.reduce((n, t) => n + t.locationCount, 0)
      const confirmed = await showConfirm({
        title: toDelete.length === 1 ? `Delete Trip ${toDelete[0].index}?` : `Delete ${toDelete.length} trips?`,
        message: `Removes ${totalPoints} location point${
          totalPoints === 1 ? "" : "s"
        } from this device only. Already-synced points remain on your server. Unsent points will not be uploaded.`,
        confirmText: "Delete",
        destructive: true
      })
      if (!confirmed) return
      try {
        await NativeLocationService.deleteLocationsInRanges(
          toDelete.map((t) => ({ start: t.startTime, end: t.endTime }))
        )
        const key = `${mapDate.getFullYear()}-${pad2(mapDate.getMonth() + 1)}`
        daysCache.current.delete(key)
        distanceCache.current.delete(key)
        await fetchTrackData()
        await fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
      } catch (error) {
        logger.error("[LocationHistory] Trip delete failed:", error)
        showAlert("Delete Failed", "Unable to delete selection. Please try again.", "error")
      }
    },
    [mapDate, fetchTrackData, fetchDaysWithData]
  )

  const handlePointNoteChange = useCallback(async (id: number, note: string | null) => {
    try {
      await NativeLocationService.updateLocationNote(id, note)
      setNoteOverrides((prev) => ({ ...prev, [id]: note ?? undefined }))
    } catch (error) {
      logger.error("[LocationHistory] Note update failed:", error)
      showAlert("Save Failed", "Unable to save note. Please try again.", "error")
    }
  }, [])

  const mapLocations = selectedTrip ? (selectedTrip.locations as LocationCoords[]) : trackLocations

  // Apply note edits for the Data tab table only; the map reads notes via its own overlay.
  const tableLocations = useMemo(
    () =>
      Object.keys(noteOverrides).length === 0
        ? trackLocations
        : trackLocations.map((l) => (l.id != null && l.id in noteOverrides ? { ...l, note: noteOverrides[l.id] } : l)),
    [trackLocations, noteOverrides]
  )

  const calendarPicker = useMemo(
    () => (
      <CalendarPicker
        date={mapDate}
        onDateChange={setMapDate}
        locationCount={trackLocations.length}
        distance={dailyDistance}
        colors={colors}
        daysWithData={daysWithData}
        dayDistances={distanceCache.current.get(`${mapDate.getFullYear()}-${pad2(mapDate.getMonth() + 1)}`)}
        onMonthChange={fetchDaysWithData}
        onPrefetchMonth={prefetchMonth}
      />
    ),
    [mapDate, trackLocations.length, dailyDistance, colors, daysWithData, fetchDaysWithData, prefetchMonth]
  )

  return (
    <Container>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <Tab label="Map" active={activeTab === "map"} onPress={() => setActiveTab("map")} colors={colors} />
        <Tab label="Trips" active={activeTab === "trips"} onPress={() => setActiveTab("trips")} colors={colors} />
        <Tab label="Data" active={activeTab === "data"} onPress={() => setActiveTab("data")} colors={colors} />
      </View>

      {activeTab === "map" && (
        <View style={styles.mapContainer}>
          {calendarPicker}
          <TrackMap
            locations={mapLocations}
            colors={colors}
            trips={selectedTrip ? undefined : trips}
            trackColor={colors.primary}
            fitVersion={fitVersion}
            onPointNoteChange={handlePointNoteChange}
          />
          {selectedTrip && (
            <Pressable
              onPress={handleShowFullDay}
              style={({ pressed }) => [
                styles.floatingPill,
                { backgroundColor: colors.primary, borderRadius: colors.borderRadius },
                pressed && { opacity: colors.pressedOpacity }
              ]}
            >
              <Text style={[styles.floatingPillText, { color: colors.textOnPrimary }]}>
                Trip {selectedTrip.index} · Show full day
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {activeTab === "trips" && (
        <View style={styles.mapContainer}>
          {calendarPicker}
          <TripList
            trips={trips}
            colors={colors}
            onTripSelect={handleTripSelect}
            selectedTripIndex={selectedTrip?.index ?? null}
            onExport={exportTrips}
            onDelete={handleDeleteTrips}
          />
        </View>
      )}

      {activeTab === "data" && (
        <View style={styles.mapContainer}>
          {calendarPicker}
          <LocationTable locations={tableLocations} colors={colors} />
        </View>
      )}
    </Container>
  )
}

const styles = StyleSheet.create({
  headerBtn: {
    padding: 8
  },
  mapContainer: {
    flex: 1
  },
  floatingPill: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4
  },
  floatingPillText: {
    fontSize: 16,
    ...fonts.semiBold
  },
  tabBar: {
    flexDirection: "row",
    marginBottom: 12
  }
})
