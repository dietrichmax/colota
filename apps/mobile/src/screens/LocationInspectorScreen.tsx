/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react"
import { View, Text, StyleSheet, Pressable } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { ChartNoAxesColumn } from "lucide-react-native"
import { Container, MapOverlay } from "../components"
import { Tab } from "../components/ui/Tab"
import { useTheme } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import { text } from "../styles/typography"
import { Trip, LocationCoords, BoundaryAction, BOUNDARY_ACTION_SPLIT } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { CalendarPicker } from "../components/features/inspector/CalendarPicker"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { TripList } from "../components/features/inspector/TripList"
import { LocationTable } from "../components/features/inspector/LocationTable"
import { formatDistance, formatTime, startOfDaySec, endOfDaySec } from "../utils/geo"
import { pad2 } from "../utils/format"
import {
  segmentTrips,
  getTripColor,
  buildBoundaryOverrideMap,
  gapsBetweenTrips,
  splitBlockedReason,
  SPLIT_BLOCKED_NOT_A_TRIP
} from "../utils/trips"
import { EXPORT_FORMATS, type ExportFormat } from "../utils/exportConverters"
import { showAlert, showConfirm } from "../services/modalService"
import type { RootScreenProps } from "../types/navigation"
import { size, MAP_OVERLAY_GUTTER, STATE_LAYER_ALPHA } from "../constants"

type TabType = "map" | "trips" | "data"

export function LocationHistoryScreen({ navigation, route }: RootScreenProps<"Location History">) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabType>(route?.params?.initialTab ?? "map")

  // Map tab state - accept initialDate from Summary screen navigation
  const [mapDate, setMapDate] = useState(() => {
    const initialDate = route?.params?.initialDate
    return initialDate ? new Date(initialDate) : new Date()
  })
  const [trackLocations, setTrackLocations] = useState<LocationCoords[]>([])
  // Note edits, kept out of trackLocations so a save doesn't hand the map a new array (which would
  // close its popup). Applied wherever a location's note is shown: the table, the map and the
  // trip handed to Trip Detail.
  const [noteOverrides, setNoteOverrides] = useState<Record<number, string | undefined>>({})
  const withNotes = useCallback(
    (locs: LocationCoords[]) =>
      Object.keys(noteOverrides).length === 0
        ? locs
        : locs.map((l) => (l.id != null && l.id in noteOverrides ? { ...l, note: noteOverrides[l.id] } : l)),
    [noteOverrides]
  )

  const [boundaryOverrides, setBoundaryOverrides] = useState<Map<string, BoundaryAction>>(() => new Map())
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [fitVersion, setFitVersion] = useState(0)

  // Calendar state
  const [daysWithData, setDaysWithData] = useState<Set<string>>(new Set())
  const [daysWithNotes, setDaysWithNotes] = useState<Set<string>>(new Set())
  const daysCache = useRef<Map<string, Set<string>>>(new Map())
  const notesCache = useRef<Map<string, Set<string>>>(new Map())
  const distanceCache = useRef<Map<string, Map<string, number>>>(new Map())

  // Trip segmentation from already-fetched day data
  const trips = useMemo(
    () => segmentTrips(trackLocations, undefined, boundaryOverrides),
    [trackLocations, boundaryOverrides]
  )

  // Sum of per-trip distances (excludes gap jumps between trips)
  const dailyDistance = useMemo(() => {
    if (trips.length === 0) return undefined
    const meters = trips.reduce((sum, trip) => sum + trip.distance, 0)
    return meters > 0 ? formatDistance(meters) : undefined
  }, [trips])

  const fetchTrackIdRef = useRef(0)
  const deletingPointRef = useRef(false)

  // Summary navigation button
  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={() => navigation.navigate("Location Summary")}
        accessibilityRole="button"
        accessibilityLabel={t("history.summary")}
        android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.lg }}
        style={styles.headerBtn}
      >
        <ChartNoAxesColumn size={size.icon.lg} color={colors.text} />
      </Pressable>
    ),
    [navigation, colors, t]
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
      const [days, stats, noteDays] = await Promise.all([
        NativeLocationService.getDaysWithData(startTs, endTs),
        NativeLocationService.getDailyStats(startTs, endTs),
        NativeLocationService.getDaysWithNotes(startTs, endTs)
      ])
      const daySet = new Set(days)
      daysCache.current.set(key, daySet)
      notesCache.current.set(key, new Set(noteDays))
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
      setDaysWithNotes(notesCache.current.get(`${year}-${pad2(month + 1)}`) ?? new Set())
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

      const [result, overrides] = await Promise.all([
        NativeLocationService.getLocationsByDateRange(startTimestamp, endTimestamp),
        NativeLocationService.getBoundaryOverrides()
      ])
      if (id === fetchTrackIdRef.current) {
        setTrackLocations(result || [])
        setBoundaryOverrides(buildBoundaryOverrideMap(overrides))
        setNoteOverrides({})
        setSelectedTrip(null)
        setFitVersion((v) => v + 1)
      }
    } catch (err) {
      logger.error("[LocationHistory] Track fetch error:", err)
      if (id === fetchTrackIdRef.current) {
        setTrackLocations([])
        setBoundaryOverrides(new Map())
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
      notesCache.current.delete(key)
      distanceCache.current.delete(key)
      fetchTrackData()
      fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
    }, [fetchTrackData, fetchDaysWithData, mapDate])
  )

  /** Tap a trip card -> open detail screen */
  // Trip Detail renders what it is handed, so notes saved this visit have to travel with it.
  const handleTripSelect = useCallback(
    (trip: Trip) => {
      const withSessionNotes = (t2: Trip) => ({ ...t2, locations: withNotes(t2.locations) })
      navigation.navigate("Trip Detail", { trip: withSessionNotes(trip), trips: trips.map(withSessionNotes) })
    },
    [navigation, trips, withNotes]
  )

  /** Export trips (all or single) */
  const exportTrips = useCallback(
    async (format: ExportFormat, tripsToExport: Trip[]) => {
      if (tripsToExport.length === 0) return
      try {
        const dateStr = mapDate.toISOString().slice(0, 10)
        const isSingle = tripsToExport.length === 1
        const shareTitle = isSingle
          ? t("history.export.shareTrip", { index: tripsToExport[0].index, date: dateStr })
          : t("history.export.shareTrips", { date: dateStr })
        const fileName = `colota_${isSingle ? `trip${tripsToExport[0].index}` : "trips"}_${dateStr}${
          EXPORT_FORMATS[format].extension
        }`
        const filePath = await NativeLocationService.exportTripsToFile(
          tripsToExport.map((trip) => ({
            index: trip.index,
            color: getTripColor(trip.index),
            startTs: trip.startTime,
            endTs: trip.endTime
          })),
          format,
          fileName
        )
        await NativeLocationService.shareFile(filePath, EXPORT_FORMATS[format].mimeType, shareTitle)
      } catch (error) {
        logger.error("[LocationHistory] Trip export failed:", error)
        showAlert(t("history.export.failed"), t("history.export.failed.message"), "error")
      }
    },
    [mapDate, t]
  )

  const handleShowFullDay = useCallback(() => {
    setSelectedTrip(null)
    setFitVersion((v) => v + 1)
  }, [])

  const handleShowDayOnMap = useCallback(() => {
    setSelectedTrip(null)
    setFitVersion((v) => v + 1)
    setActiveTab("map")
  }, [])

  const refreshAfterEdit = useCallback(async () => {
    const key = `${mapDate.getFullYear()}-${pad2(mapDate.getMonth() + 1)}`
    daysCache.current.delete(key)
    notesCache.current.delete(key)
    distanceCache.current.delete(key)
    await fetchTrackData()
    await fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
  }, [mapDate, fetchTrackData, fetchDaysWithData])

  const handleMergeTrips = useCallback(
    async (toMerge: Trip[]) => {
      if (toMerge.length < 2) return
      const sorted = [...toMerge].sort((a, b) => a.index - b.index)
      // TripList enforces an adjacency invariant before calling us, so sorted indices are contiguous.
      const first = sorted[0].index
      const last = sorted[sorted.length - 1].index
      const confirmed = await showConfirm({
        title: t("history.merge.title", { count: sorted.length }),
        message:
          sorted.length === 2
            ? t("history.merge.messagePair", { first, last })
            : t("history.merge.messageRange", { first, last }),
        confirmText: t("history.merge.confirm")
      })
      if (!confirmed) return
      // Each displayed pair can span more than one gap: trips dropped by the extent filter still
      // have their points in trackLocations, and every gap across them has to be suppressed.
      const overrides = sorted
        .slice(1)
        .flatMap((trip, i) => gapsBetweenTrips(trackLocations, sorted[i], trip, boundaryOverrides))
      try {
        await NativeLocationService.addBoundaryOverrides(overrides)
        await refreshAfterEdit()
      } catch (error) {
        logger.error("[LocationHistory] Trip merge failed:", error)
        showAlert(t("history.merge.failed"), t("history.merge.failed.message"), "error")
        // Re-throw so TripList's CAB preserves the selection and lets the user retry.
        throw error
      }
    },
    [trackLocations, boundaryOverrides, refreshAfterEdit, t]
  )

  const handleDeleteTrips = useCallback(
    async (toDelete: Trip[]) => {
      if (toDelete.length === 0) return
      const totalPoints = toDelete.reduce((n, trip) => n + trip.locationCount, 0)
      const confirmed = await showConfirm({
        title:
          toDelete.length === 1
            ? t("history.delete.titleOne", { index: toDelete[0].index })
            : t("history.delete.titleMany", { count: toDelete.length }),
        message: t("history.delete.message", { count: totalPoints }),
        confirmText: t("history.delete.confirm"),
        destructive: true
      })
      if (!confirmed) return
      try {
        await NativeLocationService.deleteLocationsInRanges(
          toDelete.map((trip) => ({ start: trip.startTime, end: trip.endTime }))
        )
        await refreshAfterEdit()
      } catch (error) {
        logger.error("[LocationHistory] Trip delete failed:", error)
        showAlert(t("history.delete.failed"), t("history.delete.failed.message"), "error")
      }
    },
    [refreshAfterEdit, t]
  )

  const splittingPointRef = useRef(false)
  const handlePointSplit = useCallback(
    async (id: number) => {
      if (splittingPointRef.current) return
      // Match on row id, not timestamp: two fixes can land in the same second
      const idx = trackLocations.findIndex((l) => l.id === id)
      // The map draws runs the extent filter dropped, so a tap can land outside every trip.
      // Splitting there would exempt both halves from that filter and conjure trips from jitter.
      const inTrip = trips.some((trip) => idx >= trip.startIndex && idx < trip.startIndex + trip.locationCount)
      const blocked = inTrip ? splitBlockedReason(trackLocations, idx, boundaryOverrides) : SPLIT_BLOCKED_NOT_A_TRIP
      if (blocked) {
        showAlert(t("history.split.blocked"), blocked, "info")
        return
      }
      const at = trackLocations[idx].timestamp
      const confirmed = await showConfirm({
        // The confirm covers the popup, so name the point in it
        title: at ? t("history.split.title", { time: formatTime(at, true) }) : t("history.split.titleUnknown"),
        message: t("history.split.message"),
        confirmText: t("history.split.confirm")
      })
      if (!confirmed) return
      splittingPointRef.current = true
      try {
        await NativeLocationService.addBoundaryOverrides([
          {
            before_timestamp: trackLocations[idx - 1].timestamp ?? 0,
            after_timestamp: trackLocations[idx].timestamp ?? 0,
            action: BOUNDARY_ACTION_SPLIT
          }
        ])
        // Re-segmenting recolours the track at the tapped point, which is the confirmation
        await refreshAfterEdit()
      } catch (error) {
        logger.error("[LocationHistory] Trip split failed:", error)
        showAlert(t("history.split.failed"), t("history.split.failed.message"), "error")
      } finally {
        splittingPointRef.current = false
      }
    },
    [trackLocations, trips, boundaryOverrides, refreshAfterEdit, t]
  )

  const handlePointDelete = useCallback(
    async (id: number) => {
      if (deletingPointRef.current) return
      // The confirm covers the popup, so name the point in it
      const point = trackLocations.find((l) => l.id === id)
      const at = point?.timestamp ? formatTime(point.timestamp, true) : null
      const confirmed = await showConfirm({
        title: at ? t("history.point.delete.title", { time: at }) : t("history.point.delete.titleUnknown"),
        message: t("history.point.delete.message"),
        confirmText: t("history.point.delete.confirm"),
        destructive: true
      })
      if (!confirmed) return
      deletingPointRef.current = true
      try {
        await NativeLocationService.deleteLocationsByIds([id])
        await refreshAfterEdit()
      } catch (error) {
        logger.error("[LocationHistory] Point delete failed:", error)
        showAlert(t("history.point.delete.failed"), t("history.point.delete.failed.message"), "error")
      } finally {
        deletingPointRef.current = false
      }
    },
    [trackLocations, refreshAfterEdit, t]
  )

  const handlePointNoteChange = useCallback(
    async (id: number, note: string | null) => {
      try {
        await NativeLocationService.updateLocationNote(id, note)
        setNoteOverrides((prev) => ({ ...prev, [id]: note ?? undefined }))
        const key = `${mapDate.getFullYear()}-${pad2(mapDate.getMonth() + 1)}`
        daysCache.current.delete(key)
        notesCache.current.delete(key)
        fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
      } catch (error) {
        logger.error("[LocationHistory] Note update failed:", error)
        showAlert(t("history.note.failed"), t("history.note.failed.message"), "error")
      }
    },
    [mapDate, fetchDaysWithData, t]
  )

  const mapLocations = selectedTrip ? (selectedTrip.locations as LocationCoords[]) : trackLocations

  // The map gets the overrides as a prop rather than merged in here, because a new locations
  // identity closes its open popup.
  const tableLocations = useMemo(() => withNotes(trackLocations), [trackLocations, withNotes])

  return (
    <Container>
      <View style={styles.tabBar}>
        <Tab label={t("history.tab.map")} active={activeTab === "map"} onPress={() => setActiveTab("map")} />
        <Tab label={t("history.tab.trips")} active={activeTab === "trips"} onPress={() => setActiveTab("trips")} />
        <Tab label={t("history.tab.data")} active={activeTab === "data"} onPress={() => setActiveTab("data")} />
      </View>

      <CalendarPicker
        date={mapDate}
        onDateChange={setMapDate}
        locationCount={trackLocations.length}
        distance={dailyDistance}
        colors={colors}
        daysWithData={daysWithData}
        daysWithNotes={daysWithNotes}
        dayDistances={distanceCache.current.get(`${mapDate.getFullYear()}-${pad2(mapDate.getMonth() + 1)}`)}
        onMonthChange={fetchDaysWithData}
        onPrefetchMonth={prefetchMonth}
      />

      {activeTab === "map" && (
        <View style={styles.tabBody}>
          <TrackMap
            locations={mapLocations}
            colors={colors}
            noteOverrides={noteOverrides}
            trips={selectedTrip ? undefined : trips}
            trackColor={colors.primary}
            fitVersion={fitVersion}
            onPointNoteChange={handlePointNoteChange}
            onPointDelete={handlePointDelete}
            onPointSplit={handlePointSplit}
          />
          {selectedTrip && (
            <View style={styles.fullDaySlot} pointerEvents="box-none">
              <MapOverlay
                testID="show-full-day-btn"
                variant="control"
                shape="pill"
                onPress={handleShowFullDay}
                accessibilityLabel={t("history.map.showFullDay", { index: selectedTrip.index })}
              >
                <Text style={[styles.fullDayLabel, { color: colors.text }]}>
                  {t("history.map.showFullDay", { index: selectedTrip.index })}
                </Text>
              </MapOverlay>
            </View>
          )}
        </View>
      )}

      {activeTab === "trips" && (
        <View style={styles.tabBody}>
          <TripList
            trips={trips}
            colors={colors}
            onTripSelect={handleTripSelect}
            selectedTripIndex={selectedTrip?.index ?? null}
            onExport={exportTrips}
            onDelete={handleDeleteTrips}
            onMerge={handleMergeTrips}
            onShowOnMap={handleShowDayOnMap}
          />
        </View>
      )}

      {activeTab === "data" && (
        <View style={styles.tabBody}>
          <LocationTable locations={tableLocations} colors={colors} />
        </View>
      )}
    </Container>
  )
}

const styles = StyleSheet.create({
  headerBtn: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  tabBody: {
    flex: 1
  },
  fullDaySlot: {
    // Top-centre, not the foot: the map's own centre control and point popup own the bottom.
    position: "absolute",
    start: 0,
    end: 0,
    top: MAP_OVERLAY_GUTTER,
    alignItems: "center"
  },
  fullDayLabel: {
    ...text.bodyStrong
  },
  tabBar: {
    flexDirection: "row"
  }
})
