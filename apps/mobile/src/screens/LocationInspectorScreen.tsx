/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react"
import { AccessibilityInfo, View, StyleSheet, BackHandler, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useFocusEffect } from "@react-navigation/native"
import {
  CalendarCheck,
  ChartNoAxesColumn,
  CirclePause,
  EllipsisVertical,
  Merge,
  RotateCcwClock,
  Route,
  Upload,
  Table,
  Trash2,
  X
} from "lucide-react-native"
import {
  Container,
  DayHeader,
  DayPickerModal,
  Divider,
  EmptyState,
  InspectorDock,
  SpinningLoader,
  TrackMap,
  HeaderAction
} from "../components"
import type { DockContent } from "../components/features/inspector/InspectorDock"
import { dayLongDate, dayTitle, type DayStats } from "../components/features/inspector/DayHeader"
import { Tab } from "../components/ui/Tab"
import { TripList } from "../components/features/inspector/TripList"
import { ExportFormatDialog } from "../components/features/inspector/ExportFormatDialog"
import { LocationTable } from "../components/features/inspector/LocationTable"
import { useTheme } from "../hooks/useTheme"
import { useTimeout } from "../hooks/useTimeout"
import { useTracking } from "../contexts/TrackingProvider"
import { Trip, LocationCoords, BoundaryAction, type DailyStat } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { formatTime, startOfDaySec, endOfDaySec } from "../utils/geo"
import { segmentTrips, getTripColor, buildBoundaryOverrideMap, gapsBetweenTrips } from "../utils/trips"
import { EXPORT_FORMATS, type ExportFormat } from "../utils/exportConverters"
import {
  EMPTY_MONTH,
  dateFromKey,
  dayKey,
  emptyDayVariant,
  exportMessage,
  findLastDayWithData,
  isAdjacentSelection,
  lastDaySub,
  monthKey,
  type LastDay,
  type MonthData
} from "../utils/inspectorDay"
import { showAlert, showChoice, showConfirm } from "../services/modalService"
import type { RootScreenProps } from "../types/navigation"
import { LOADING_INDICATOR_DELAY_MS, size, space } from "../constants"

type TabType = "map" | "trips" | "data"

// setOptions cannot unset a key, so leaving selection writes the SCREEN_CONFIG title back.
const SCREEN_TITLE = "Location history"
const NO_SELECTION = new Set<number>()

type ExportRequest = { title: string; message: string; resolve: (format: ExportFormat | null) => void }

export function LocationHistoryScreen({ navigation, route }: RootScreenProps<"Location History">) {
  const { colors } = useTheme()
  const { settings, tracking } = useTracking()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const [activeTab, setActiveTab] = useState<TabType>(route?.params?.initialTab ?? "map")

  const [mapDate, setMapDate] = useState(() => {
    const initialDate = route?.params?.initialDate
    return initialDate ? new Date(initialDate) : new Date()
  })
  const [trackLocations, setTrackLocations] = useState<LocationCoords[]>([])
  // Note edits stay out of trackLocations so a save does not hand the map a new array.
  const [noteOverrides, setNoteOverrides] = useState<Record<number, string | undefined>>({})
  const withNotes = useCallback(
    (locs: LocationCoords[]) =>
      Object.keys(noteOverrides).length === 0
        ? locs
        : locs.map((l) => (l.id != null && l.id in noteOverrides ? { ...l, note: noteOverrides[l.id] } : l)),
    [noteOverrides]
  )

  const [boundaryOverrides, setBoundaryOverrides] = useState<Map<string, BoundaryAction>>(() => new Map())
  const [fitVersion, setFitVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showSpinner, setShowSpinner] = useState(false)
  const [lastDay, setLastDay] = useState<LastDay | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null)
  const [focusedTripIndex, setFocusedTripIndex] = useState<number | null>(null)
  const [selected, setSelected] = useState(NO_SELECTION)
  const [dockHeight, setDockHeight] = useState(0)

  const [daysWithData, setDaysWithData] = useState(() => new Set<string>())
  const [monthStats, setMonthStats] = useState<ReadonlyMap<string, DailyStat>>(EMPTY_MONTH.stats)
  const monthCache = useRef<Map<string, MonthData>>(new Map())

  const trips = useMemo(
    () => segmentTrips(trackLocations, undefined, boundaryOverrides),
    [trackLocations, boundaryOverrides]
  )
  const dayDistanceMeters = useMemo(() => trips.reduce((sum, t) => sum + t.distance, 0), [trips])
  const dayStats: DayStats | null =
    trackLocations.length === 0
      ? null
      : { points: trackLocations.length, trips: trips.length, distanceMeters: dayDistanceMeters }
  const isToday = dayKey(mapDate) === dayKey(new Date())
  const hasEndpoint = settings.endpoint.trim().length > 0
  const selecting = selected.size > 0

  const fetchTrackIdRef = useRef(0)
  const deletingPointRef = useRef(false)
  const editingTripsRef = useRef(false)
  const wasSelectingRef = useRef(false)

  const { set: startSpinnerTimer, clear: clearSpinnerTimer } = useTimeout()
  useEffect(() => {
    if (!loading) {
      clearSpinnerTimer()
      setShowSpinner(false)
      return
    }
    startSpinnerTimer(() => setShowSpinner(true), LOADING_INDICATOR_DELAY_MS)
  }, [loading, startSpinnerTimer, clearSpinnerTimer])

  const prefetchMonth = useCallback(async (year: number, month: number): Promise<MonthData> => {
    const key = monthKey(year, month)
    const cached = monthCache.current.get(key)
    if (cached) return cached
    try {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59)
      const startTs = Math.floor(start.getTime() / 1000)
      const endTs = Math.floor(end.getTime() / 1000)
      const [days, stats] = await Promise.all([
        NativeLocationService.getDaysWithData(startTs, endTs),
        NativeLocationService.getDailyStats(startTs, endTs)
      ])
      const data: MonthData = { days: new Set(days), stats: new Map(stats.map((s) => [s.day, s] as const)) }
      monthCache.current.set(key, data)
      return data
    } catch (err) {
      logger.error("[LocationHistory] Failed to fetch days with data:", err)
      return EMPTY_MONTH
    }
  }, [])

  const fetchDaysWithData = useCallback(
    async (year: number, month: number) => {
      const data = await prefetchMonth(year, month)
      setDaysWithData(new Set(data.days))
      setMonthStats(data.stats)
    },
    [prefetchMonth]
  )

  useEffect(() => {
    fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
  }, [mapDate, fetchDaysWithData])

  const fetchTrackData = useCallback(async () => {
    const id = ++fetchTrackIdRef.current
    setLoading(true)
    try {
      const [result, overrides] = await Promise.all([
        NativeLocationService.getLocationsByDateRange(startOfDaySec(mapDate), endOfDaySec(mapDate)),
        NativeLocationService.getBoundaryOverrides()
      ])
      const locations: LocationCoords[] = result || []
      const last = locations.length === 0 ? await findLastDayWithData(mapDate, prefetchMonth) : null
      if (id !== fetchTrackIdRef.current) return
      setTrackLocations(locations)
      setBoundaryOverrides(buildBoundaryOverrideMap(overrides))
      setNoteOverrides({})
      setLastDay(last)
      setSelectedPointId(null)
      setFocusedTripIndex(null)
      setFitVersion((v) => v + 1)
      setLoading(false)
    } catch (err) {
      logger.error("[LocationHistory] Track fetch error:", err)
      if (id !== fetchTrackIdRef.current) return
      setTrackLocations([])
      setBoundaryOverrides(new Map())
      setNoteOverrides({})
      setLastDay(null)
      setSelectedPointId(null)
      setFocusedTripIndex(null)
      setFitVersion((v) => v + 1)
      setLoading(false)
      showAlert("Load Failed", "Unable to load this day. Please try again.", "error")
    }
  }, [mapDate, prefetchMonth])

  useEffect(() => {
    fetchTrackData()
  }, [fetchTrackData])

  const invalidateMonth = useCallback(() => {
    monthCache.current.delete(monthKey(mapDate.getFullYear(), mapDate.getMonth()))
  }, [mapDate])

  useFocusEffect(
    useCallback(() => {
      invalidateMonth()
      fetchTrackData()
      fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
    }, [invalidateMonth, fetchTrackData, fetchDaysWithData, mapDate])
  )

  const refreshAfterEdit = useCallback(async () => {
    invalidateMonth()
    await fetchTrackData()
    await fetchDaysWithData(mapDate.getFullYear(), mapDate.getMonth())
  }, [invalidateMonth, mapDate, fetchTrackData, fetchDaysWithData])

  const exitSelection = useCallback(() => setSelected(NO_SELECTION), [])

  const changeDay = useCallback(
    (date: Date) => {
      setMapDate(date)
      setFocusedTripIndex(null)
      setSelectedPointId(null)
      exitSelection()
    },
    [exitSelection]
  )

  const stepDay = useCallback(
    (delta: number) => changeDay(new Date(mapDate.getFullYear(), mapDate.getMonth(), mapDate.getDate() + delta)),
    [mapDate, changeDay]
  )

  const goToToday = useCallback(() => changeDay(new Date()), [changeDay])

  const changeTab = useCallback(
    (tab: TabType) => {
      setActiveTab(tab)
      exitSelection()
    },
    [exitSelection]
  )

  // Trip Detail renders what it is handed, so notes saved this visit have to travel with it.
  const openTrip = useCallback(
    (index: number) => {
      const trip = trips.find((t) => t.index === index)
      if (!trip) return
      const withSessionNotes = (t: Trip) => ({ ...t, locations: withNotes(t.locations) })
      navigation.navigate("Trip Detail", { trip: withSessionNotes(trip), trips: trips.map(withSessionNotes) })
    },
    [navigation, trips, withNotes]
  )

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

  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null)
  const chooseExportFormat = useCallback(
    (title: string, message: string) =>
      new Promise<ExportFormat | null>((resolve) => setExportRequest({ title, message, resolve })),
    []
  )
  const settleExport = useCallback(
    (format: ExportFormat | null) => {
      exportRequest?.resolve(format)
      setExportRequest(null)
    },
    [exportRequest]
  )

  const handleExportDay = useCallback(async () => {
    const format = await chooseExportFormat(
      "Export day",
      exportMessage(dayTitle(mapDate), trips.length, dayDistanceMeters)
    )
    if (format) await exportTrips(format, trips)
  }, [mapDate, trips, dayDistanceMeters, exportTrips, chooseExportFormat])

  const selectedTrips = useMemo(() => trips.filter((t) => selected.has(t.index)), [trips, selected])
  const canMerge = isAdjacentSelection(selected)

  const handleExportSelected = useCallback(async () => {
    if (selectedTrips.length === 0) return
    const distance = selectedTrips.reduce((sum, t) => sum + t.distance, 0)
    const format = await chooseExportFormat(
      selectedTrips.length === 1 ? `Export Trip ${selectedTrips[0].index}` : `Export ${selectedTrips.length} trips`,
      exportMessage(dayTitle(mapDate), selectedTrips.length, distance)
    )
    if (format) await exportTrips(format, selectedTrips)
  }, [selectedTrips, mapDate, exportTrips, chooseExportFormat])

  const handleMergeSelected = useCallback(async () => {
    if (editingTripsRef.current) return
    editingTripsRef.current = true
    try {
      if (!canMerge) {
        showAlert("Merge trips", "Select two or more trips that follow each other.", "info")
        return
      }
      const sorted = [...selectedTrips].sort((a, b) => a.index - b.index)
      const first = sorted[0].index
      const last = sorted[sorted.length - 1].index
      const confirmed = await showConfirm({
        title: `Merge ${sorted.length} trips?`,
        message: `${sorted.length === 2 ? `Trips ${first} and ${last}` : `Trips ${first}-${last}`} will be combined into one.`,
        confirmText: "Merge"
      })
      if (!confirmed) return
      // Each displayed pair can span more than one gap: trips dropped by the extent filter still
      // have their points in trackLocations, and every gap across them has to be suppressed.
      const overrides = sorted
        .slice(1)
        .flatMap((trip, i) => gapsBetweenTrips(trackLocations, sorted[i], trip, boundaryOverrides))
      try {
        await NativeLocationService.addBoundaryOverrides(overrides)
        exitSelection()
        await refreshAfterEdit()
      } catch (error) {
        logger.error("[LocationHistory] Trip merge failed:", error)
        showAlert("Merge Failed", "Unable to merge the selected trips. Please try again.", "error")
      }
    } finally {
      editingTripsRef.current = false
    }
  }, [canMerge, selectedTrips, trackLocations, boundaryOverrides, exitSelection, refreshAfterEdit])

  const handleDeleteSelected = useCallback(async () => {
    if (selectedTrips.length === 0 || editingTripsRef.current) return
    editingTripsRef.current = true
    try {
      const totalPoints = selectedTrips.reduce((n, t) => n + t.locationCount, 0)
      const confirmed = await showConfirm({
        title:
          selectedTrips.length === 1
            ? `Delete Trip ${selectedTrips[0].index}?`
            : `Delete ${selectedTrips.length} trips?`,
        message: `Removes ${totalPoints} location point${
          totalPoints === 1 ? "" : "s"
        } from this device only. Already-synced points remain on your server. Unsent points will not be uploaded.`,
        confirmText: "Delete",
        destructive: true
      })
      if (!confirmed) return
      try {
        await NativeLocationService.deleteLocationsInRanges(
          selectedTrips.map((t) => ({ start: t.startTime, end: t.endTime }))
        )
        exitSelection()
        await refreshAfterEdit()
      } catch (error) {
        logger.error("[LocationHistory] Trip delete failed:", error)
        showAlert("Delete Failed", "Unable to delete selection. Please try again.", "error")
      }
    } finally {
      editingTripsRef.current = false
    }
  }, [selectedTrips, exitSelection, refreshAfterEdit])

  const handleMoreSelection = useCallback(async () => {
    const choice = await showChoice({
      title: "Selection",
      message: `${selected.size} of ${trips.length} trips selected`,
      variant: "info",
      buttons: [{ text: "Select all" }, { text: "Clear selection" }, { text: "Cancel", style: "secondary" }]
    })
    if (choice === 0) setSelected(new Set(trips.map((t) => t.index)))
    else if (choice === 1) exitSelection()
  }, [selected.size, trips, exitSelection])

  const toggleTrip = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const enterSelection = useCallback((index: number) => setSelected(new Set([index])), [])

  // The title carries the count, and a title change is silent for a screen reader.
  useEffect(() => {
    if (selecting) AccessibilityInfo.announceForAccessibility(`${selected.size} selected`)
    else if (wasSelectingRef.current) AccessibilityInfo.announceForAccessibility("Selection cleared")
    wasSelectingRef.current = selecting
  }, [selecting, selected.size])

  useEffect(() => {
    if (!selecting) return
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      exitSelection()
      return true
    })
    return () => subscription.remove()
  }, [selecting, exitSelection])

  const renderExitSelection = useCallback(
    () => <HeaderAction icon={X} label="Exit selection" onPress={exitSelection} testID="exit-selection-btn" />,
    [exitSelection]
  )

  const renderSelectionActions = useCallback(
    () => (
      <View style={styles.headerRow}>
        <HeaderAction
          icon={Upload}
          label="Export selected trips"
          onPress={handleExportSelected}
          testID="export-selected-btn"
        />
        {selected.size > 1 && (
          <HeaderAction
            icon={Merge}
            label="Merge trips"
            hint={canMerge ? undefined : "Select two or more trips that follow each other"}
            color={canMerge ? colors.text : colors.textDisabled}
            onPress={handleMergeSelected}
            testID="merge-btn"
          />
        )}
        <HeaderAction
          icon={Trash2}
          label="Delete trips"
          color={colors.error}
          onPress={handleDeleteSelected}
          testID="delete-trips-btn"
        />
        <HeaderAction icon={EllipsisVertical} label="More" onPress={handleMoreSelection} testID="more-btn" />
      </View>
    ),
    [
      colors,
      canMerge,
      selected.size,
      handleExportSelected,
      handleMergeSelected,
      handleDeleteSelected,
      handleMoreSelection
    ]
  )

  const renderDayActions = useCallback(
    () => (
      <View style={styles.headerRow}>
        {!isToday && <HeaderAction icon={CalendarCheck} label="Go to today" onPress={goToToday} testID="today-btn" />}
        {trips.length > 0 && (
          <HeaderAction icon={Upload} label="Export day" onPress={handleExportDay} testID="export-day-btn" />
        )}
        <HeaderAction
          icon={ChartNoAxesColumn}
          label="Location summary"
          onPress={() => navigation.navigate("Location Summary")}
          testID="summary-btn"
        />
      </View>
    ),
    [isToday, trips.length, goToToday, handleExportDay, navigation]
  )

  useLayoutEffect(() => {
    if (selecting) {
      navigation.setOptions({
        headerLeft: renderExitSelection,
        headerTitle: `${selected.size} selected`,
        headerStyle: { backgroundColor: colors.card },
        headerRight: renderSelectionActions
      })
      return
    }
    navigation.setOptions({
      headerLeft: undefined,
      headerTitle: SCREEN_TITLE,
      headerStyle: undefined,
      headerRight: renderDayActions
    })
  }, [navigation, colors, selecting, selected.size, renderExitSelection, renderSelectionActions, renderDayActions])

  const handlePointDelete = useCallback(
    async (id: number) => {
      if (deletingPointRef.current) return
      const point = trackLocations.find((l) => l.id === id)
      const at = point?.timestamp ? formatTime(point.timestamp, true) : null
      const confirmed = await showConfirm({
        title: at ? `Delete the point at ${at}?` : "Delete Point?",
        message:
          "Removes this point from this device only. If it has already synced it stays on your server, and if it has not it will never be uploaded.",
        confirmText: "Delete",
        destructive: true
      })
      if (!confirmed) return
      deletingPointRef.current = true
      try {
        await NativeLocationService.deleteLocationsByIds([id])
        await refreshAfterEdit()
      } catch (error) {
        logger.error("[LocationHistory] Point delete failed:", error)
        showAlert("Delete Failed", "Unable to delete point. Please try again.", "error")
      } finally {
        deletingPointRef.current = false
      }
    },
    [trackLocations, refreshAfterEdit]
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

  const focusTripFromDock = useCallback((index: number | null) => {
    setFocusedTripIndex(index)
    setFitVersion((v) => v + 1)
  }, [])

  const selectPointFromTable = useCallback(
    (id: number) => {
      setSelectedPointId(id)
      changeTab("map")
    },
    [changeTab]
  )

  const tableLocations = useMemo(() => withNotes(trackLocations), [trackLocations, withNotes])

  const edgeStart = space.lg + insets.left
  const edgeEnd = space.lg + insets.right
  const controlsBottom = space.lg + dockHeight + space.sm
  const cameraPadding = useMemo(
    () => ({
      top: space.lg,
      bottom: dockHeight + space.lg + space.lg,
      left: edgeStart,
      right: edgeEnd + size.iconColumn + space.lg
    }),
    [dockHeight, edgeStart, edgeEnd]
  )

  const empty = emptyDayVariant({ isToday, tracking, longDate: dayLongDate(mapDate), hasLastDay: lastDay !== null })
  const dockEmptyAction =
    empty.action === "lastDay" && lastDay
      ? {
          icon: RotateCcwClock,
          label: "Last day with data",
          sub: lastDaySub(lastDay),
          onPress: () => changeDay(dateFromKey(lastDay.day))
        }
      : empty.action === "dashboard"
        ? {
            icon: CirclePause,
            label: "Open Dashboard",
            sub: "Tracking is off",
            onPress: () => navigation.navigate("Dashboard")
          }
        : undefined
  const emptyAction = dockEmptyAction && { label: dockEmptyAction.label, onPress: dockEmptyAction.onPress }

  const selectedPoint = selectedPointId == null ? undefined : trackLocations.find((l) => l.id === selectedPointId)
  let dockContent: DockContent
  if (selectedPoint && selectedPointId != null) {
    const id = selectedPointId
    dockContent = {
      kind: "point",
      point: selectedPoint,
      note: id in noteOverrides ? noteOverrides[id] : selectedPoint.note,
      hasEndpoint,
      onDelete: () => handlePointDelete(id),
      onClose: () => setSelectedPointId(null),
      onSaveNote: (note) => handlePointNoteChange(id, note)
    }
  } else if (trackLocations.length === 0) {
    dockContent = { kind: "empty", title: empty.title, hint: empty.hint, action: dockEmptyAction }
  } else if (trips.length === 0) {
    dockContent = {
      kind: "points",
      count: trackLocations.length,
      startTime: trackLocations[0].timestamp ?? 0,
      endTime: trackLocations[trackLocations.length - 1].timestamp ?? 0
    }
  } else {
    dockContent = { kind: "legend", trips, focusedTripIndex, onFocusTrip: focusTripFromDock }
  }

  const spinner = showSpinner ? (
    <View style={styles.spinner} pointerEvents="none" testID="day-loading">
      <SpinningLoader size={size.icon.lg} color={colors.primary} />
    </View>
  ) : null

  return (
    <Container>
      <DayHeader
        date={mapDate}
        stats={dayStats}
        loading={loading}
        onPrevious={() => stepDay(-1)}
        onNext={() => stepDay(1)}
        onOpenPicker={() => setPickerOpen(true)}
        nextDisabled={isToday}
      />
      <DayPickerModal
        visible={pickerOpen}
        date={mapDate}
        onSelect={changeDay}
        onRequestClose={() => setPickerOpen(false)}
        daysWithData={daysWithData}
        dayStats={monthStats}
        onMonthChange={fetchDaysWithData}
        onPrefetchMonth={prefetchMonth}
      />

      <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
        <Tab label="Map" active={activeTab === "map"} onPress={() => changeTab("map")} colors={colors} />
        <Tab label="Trips" active={activeTab === "trips"} onPress={() => changeTab("trips")} colors={colors} />
        <Tab label="Data" active={activeTab === "data"} onPress={() => changeTab("data")} colors={colors} />
      </View>
      <Divider tight />

      <View style={styles.content}>
        {activeTab === "map" && (
          <>
            <TrackMap
              locations={trackLocations}
              colors={colors}
              noteOverrides={noteOverrides}
              trips={trips}
              trackColor={colors.primary}
              fitVersion={fitVersion}
              selectedPointId={selectedPointId}
              onSelectPoint={setSelectedPointId}
              focusedTripIndex={focusedTripIndex}
              onFocusTrip={setFocusedTripIndex}
              cameraPadding={cameraPadding}
              controlsBottom={controlsBottom}
              controlsEnd={edgeEnd}
            />
            {loading ? (
              spinner
            ) : (
              <InspectorDock
                content={dockContent}
                left={edgeStart}
                right={edgeEnd}
                maxHeight={windowHeight / 2}
                onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
              />
            )}
          </>
        )}

        {activeTab === "trips" &&
          (loading ? (
            spinner
          ) : trackLocations.length === 0 ? (
            <EmptyState icon={Route} title={empty.title} hint={empty.hint} action={emptyAction} />
          ) : trips.length === 0 ? (
            <EmptyState
              icon={Route}
              title="No trips"
              hint={`${trackLocations.length} points were recorded but none spread more than 100 m`}
              action={{ label: "Show points", onPress: () => changeTab("data") }}
            />
          ) : (
            <TripList
              trips={trips}
              selected={selected}
              onToggle={toggleTrip}
              onEnterSelection={enterSelection}
              onOpenTrip={openTrip}
            />
          ))}

        {activeTab === "data" &&
          (loading ? (
            spinner
          ) : trackLocations.length === 0 ? (
            <EmptyState icon={Table} title={empty.title} hint={empty.hint} action={emptyAction} />
          ) : (
            <LocationTable
              locations={tableLocations}
              colors={colors}
              hasEndpoint={hasEndpoint}
              selectedPointId={selectedPointId ?? undefined}
              onSelectPoint={selectPointFromTable}
            />
          ))}
      </View>
      <ExportFormatDialog
        visible={exportRequest !== null}
        title={exportRequest?.title ?? ""}
        message={exportRequest?.message ?? ""}
        onSelect={settleExport}
        onRequestClose={() => settleExport(null)}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row"
  },
  tabBar: {
    flexDirection: "row"
  },
  content: {
    flex: 1
  },
  spinner: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center"
  }
})
