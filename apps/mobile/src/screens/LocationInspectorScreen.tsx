/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react"
import { View, Text, StyleSheet, Pressable } from "react-native"
import { fonts } from "../styles/typography"
import { BarChart2 } from "lucide-react-native"
import { Container } from "../components"
import { useTheme } from "../hooks/useTheme"
import { Trip, LocationCoords, ThemeColors } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { CalendarPicker } from "../components/features/inspector/CalendarPicker"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { TripList } from "../components/features/inspector/TripList"
import { LocationTable } from "../components/features/inspector/LocationTable"
import { formatDistance } from "../utils/geo"
import { segmentTrips } from "../utils/trips"
import { TRIP_CONVERTERS, EXPORT_FORMATS, type ExportFormat } from "../utils/exportConverters"
import { showAlert } from "../services/modalService"

interface TabProps {
  label: string
  active: boolean
  onPress: () => void
  colors: ThemeColors
}

type TabType = "map" | "trips" | "data"

export function LocationHistoryScreen({ navigation, route }: { navigation: any; route: any }) {
  const { colors } = useTheme()
  const [activeTab, setActiveTab] = useState<TabType>(route?.params?.initialTab ?? "map")

  // Map tab state - accept initialDate from Summary screen navigation
  const [mapDate, setMapDate] = useState(() => {
    const initialDate = route?.params?.initialDate
    return initialDate ? new Date(initialDate) : new Date()
  })
  const [trackLocations, setTrackLocations] = useState<LocationCoords[]>([])
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [fitVersion, setFitVersion] = useState(0)

  // Calendar state
  const [daysWithData, setDaysWithData] = useState<Set<string>>(new Set())
  const daysCache = useRef<Map<string, Set<string>>>(new Map())

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
        style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
      >
        <BarChart2 size={20} color={colors.text} />
      </Pressable>
    ),
    [navigation, colors]
  )

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight })
  }, [navigation, headerRight])

  /** Fetch days-with-data for a month into cache; returns the Set. */
  const prefetchMonth = useCallback(async (year: number, month: number): Promise<Set<string>> => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`
    if (daysCache.current.has(key)) return daysCache.current.get(key)!
    try {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59)
      const startTs = Math.floor(start.getTime() / 1000)
      const endTs = Math.floor(end.getTime() / 1000)
      const days = await NativeLocationService.getDaysWithData(startTs, endTs)
      const daySet = new Set(days)
      daysCache.current.set(key, daySet)
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
      const start = new Date(mapDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(mapDate)
      end.setHours(23, 59, 59, 999)

      const startTimestamp = Math.floor(start.getTime() / 1000)
      const endTimestamp = Math.floor(end.getTime() / 1000)

      const result = await NativeLocationService.getLocationsByDateRange(startTimestamp, endTimestamp)
      if (id === fetchTrackIdRef.current) {
        setTrackLocations(result || [])
        setSelectedTrip(null)
        setFitVersion((v) => v + 1)
      }
    } catch (err) {
      logger.error("[LocationHistory] Track fetch error:", err)
      if (id === fetchTrackIdRef.current) {
        setTrackLocations([])
        setSelectedTrip(null)
        setFitVersion((v) => v + 1)
      }
    }
  }, [mapDate])

  /** Fetch track data when map date changes */
  useEffect(() => {
    fetchTrackData()
  }, [fetchTrackData])

  /** Tap a trip card -> open detail screen */
  const handleTripSelect = useCallback(
    (trip: Trip) => {
      navigation.navigate("Trip Detail", { trip })
    },
    [navigation]
  )

  /** Export trips (all or single) */
  const exportTrips = useCallback(
    async (format: ExportFormat, tripsToExport: Trip[]) => {
      if (tripsToExport.length === 0) return
      try {
        const content = TRIP_CONVERTERS[format](tripsToExport)
        const dateStr = mapDate.toISOString().slice(0, 10)
        const isSingle = tripsToExport.length === 1
        const label = isSingle ? `Trip ${tripsToExport[0].index}` : "Trips"
        const fileName = `colota_${isSingle ? `trip${tripsToExport[0].index}` : "trips"}_${dateStr}${
          EXPORT_FORMATS[format].extension
        }`
        const filePath = await NativeLocationService.writeFile(fileName, content)
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

  const handleTripExport = useCallback((format: ExportFormat) => exportTrips(format, trips), [exportTrips, trips])
  const handleSingleTripExport = useCallback(
    (format: ExportFormat, trip: Trip) => exportTrips(format, [trip]),
    [exportTrips]
  )

  const mapLocations = selectedTrip ? (selectedTrip.locations as LocationCoords[]) : trackLocations

  const calendarPicker = useMemo(
    () => (
      <CalendarPicker
        date={mapDate}
        onDateChange={setMapDate}
        locationCount={trackLocations.length}
        distance={dailyDistance}
        colors={colors}
        daysWithData={daysWithData}
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
            selectedPoint={null}
            colors={colors}
            trips={selectedTrip ? undefined : trips}
            fitVersion={fitVersion}
          />
          {selectedTrip && (
            <Pressable
              onPress={handleShowFullDay}
              style={({ pressed }) => [
                styles.floatingPill,
                { backgroundColor: colors.primary, borderRadius: colors.borderRadius },
                pressed && { opacity: 0.7 }
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
            onExport={handleTripExport}
            onExportTrip={handleSingleTripExport}
          />
        </View>
      )}

      {activeTab === "data" && (
        <View style={styles.mapContainer}>
          {calendarPicker}
          <LocationTable locations={trackLocations} colors={colors} />
        </View>
      )}
    </Container>
  )
}

const Tab = ({ label, active, onPress, colors }: TabProps) => {
  const borderBottomColor = active ? colors.primary : "transparent"
  const textColor = active ? colors.primary : colors.textSecondary

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, { borderBottomColor }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive, { color: textColor }]}>
        {label}
      </Text>
    </Pressable>
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
  },
  tab: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 2
  },
  tabText: {
    fontSize: 14
  },
  tabTextActive: {
    ...fonts.bold
  },
  tabTextInactive: {
    ...fonts.regular
  }
})
