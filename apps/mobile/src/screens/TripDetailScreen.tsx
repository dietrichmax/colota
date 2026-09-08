/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo, useState, useCallback, useLayoutEffect, useEffect, useRef } from "react"
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Upload, Trash2, Route, Clock, Gauge, MapPin, TrendingUp, TrendingDown } from "lucide-react-native"
import { useTheme } from "../hooks/useTheme"
import { fontSizes, fonts } from "../styles/typography"
// Deep paths on purpose: the components barrel re-exports DashboardMap, which reaches
// TrackingProvider and builds a NativeEventEmitter at module scope. This screen needs none of it.
import { Card } from "../components/ui/Card"
import { Container } from "../components/ui/Container"
import { SectionTitle } from "../components/ui/SectionTitle"
import { Divider } from "../components/ui/Divider"
import { StatRow } from "../components/ui/StatRow"
import { StepperHeader } from "../components/ui/StepperHeader"
import { HeaderAction } from "../components/ui/HeaderAction"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { TripSwatch } from "../components/features/inspector/TripRow"
import { ExportFormatDialog } from "../components/features/inspector/ExportFormatDialog"
import { InspectorDock } from "../components/features/inspector/InspectorDock"
import { InteractiveLineChart } from "../components/features/inspector/InteractiveLineChart"
import { getTripColor, computeTripStats, buildBoundaryOverrideMap, splitBlockedReason } from "../utils/trips"
import { formatDate, formatDistance, formatDuration, formatSpeed, formatTime } from "../utils/geo"
import { EXPORT_FORMATS, type ExportFormat } from "../utils/exportConverters"
import { size, space } from "../constants"
import { showAlert, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import NativeLocationService from "../services/NativeLocationService"
import { BOUNDARY_ACTION_SPLIT } from "../types/global"
import type { Trip, BoundaryAction } from "../types/global"
import type { RootScreenProps } from "../types/navigation"

const MAX_BARS = 120

/** Downsample an array to at most maxBars entries by averaging buckets. */
function downsample(values: number[], maxBars: number): number[] {
  if (values.length <= maxBars) return values
  const bucketSize = values.length / maxBars
  const result: number[] = []
  for (let i = 0; i < maxBars; i++) {
    const start = Math.floor(i * bucketSize)
    const end = Math.floor((i + 1) * bucketSize)
    let sum = 0
    for (let j = start; j < end; j++) sum += values[j]
    result.push(sum / (end - start))
  }
  return result
}

const MAP_VIEWPORT_SHARE = 0.5
// The point card may cover this much of the map; a band of tiles always stays above it.
const DOCK_MAP_SHARE = 0.6

export function TripDetailScreen({ route, navigation }: RootScreenProps<"Trip Detail">) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: viewportHeight } = useWindowDimensions()
  const mapHeight = Math.round(viewportHeight * MAP_VIEWPORT_SHARE)
  const trip: Trip = route.params.trip
  const trips: Trip[] = route.params.trips
  const tripColor = getTripColor(trip.index)
  const [deleting, setDeleting] = useState(false)
  // The map reads a note back when the point is re-tapped, and the chevrons swap in a trip from
  // route.params, so a saved note has to be held here rather than inside the map.
  const [noteOverrides, setNoteOverrides] = useState<Record<number, string | undefined>>({})
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null)
  const [dockHeight, setDockHeight] = useState(0)
  const [hasEndpoint, setHasEndpoint] = useState(false)

  const stats = useMemo(() => computeTripStats(trip.locations), [trip])
  const duration = trip.endTime - trip.startTime
  const displayName = `Trip ${trip.index}`

  const [exportOpen, setExportOpen] = useState(false)
  const [chartActiveIndex, setChartActiveIndex] = useState<number | null>(null)
  // Without these, a boundary the user merged reads as a plain gap and refuses to split
  const [boundaryOverrides, setBoundaryOverrides] = useState<Map<string, BoundaryAction>>(() => new Map())
  // Splitting before they arrive would judge a merged boundary as a plain gap and refuse a legal split
  const [boundariesLoaded, setBoundariesLoaded] = useState(false)

  useEffect(() => {
    let active = true
    NativeLocationService.getBoundaryOverrides()
      .then((o) => {
        if (active) setBoundaryOverrides(buildBoundaryOverrideMap(o))
      })
      // Split stays available on plain gaps; only merged boundaries stop being offered
      .catch((error) => logger.error("[TripDetail] Boundary override load failed:", error))
      .finally(() => {
        if (active) setBoundariesLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    NativeLocationService.getSetting("endpoint")
      .then((endpoint) => {
        if (active) setHasEndpoint((endpoint ?? "").trim().length > 0)
      })
      .catch((error) => logger.error("[TripDetail] Endpoint read failed:", error))
    return () => {
      active = false
    }
  }, [])

  const currentIdx = trips.findIndex((t) => t.index === trip.index)
  const prevTrip = currentIdx > 0 ? trips[currentIdx - 1] : null
  const nextTrip = currentIdx >= 0 && currentIdx < trips.length - 1 ? trips[currentIdx + 1] : null

  // Reset transient UI state when switching to a different trip.
  useEffect(() => {
    setChartActiveIndex(null)
    setExportOpen(false)
    setSelectedPointId(null)
  }, [trip.index])

  const goToTrip = useCallback(
    (target: Trip | null) => {
      if (!target) return
      navigation.setParams({ trip: target })
    },
    [navigation]
  )

  const handlePointNoteChange = useCallback(async (id: number, note: string | null) => {
    try {
      await NativeLocationService.updateLocationNote(id, note)
      setNoteOverrides((prev) => ({ ...prev, [id]: note ?? undefined }))
    } catch (error) {
      logger.error("[TripDetail] Note update failed:", error)
      showAlert("Save Failed", "Unable to save note. Please try again.", "error")
    }
  }, [])

  const splittingRef = useRef(false)
  const handlePointSplit = useCallback(
    async (id: number) => {
      if (splittingRef.current) return
      if (!boundariesLoaded) {
        showAlert("Cannot Split Here", "Still loading this trip's edits. Try again in a moment.", "info")
        return
      }
      // A trip's locations are a contiguous run of the day, so the preceding point is the one
      // that ends the trip.
      const idx = trip.locations.findIndex((l) => l.id === id)
      const blocked = splitBlockedReason(trip.locations, idx, boundaryOverrides)
      if (blocked) {
        showAlert("Cannot Split Here", blocked, "info")
        return
      }
      const at = trip.locations[idx].timestamp
      const confirmed = await showConfirm({
        // The confirm covers the popup, so name the point in it
        title: at ? `Start a new trip at ${formatTime(at, true)}?` : "Split Trip?",
        message:
          "Everything from this point onwards becomes a separate trip. Your location data is not changed, and you can undo this by merging the two trips again.",
        confirmText: "Split"
      })
      if (!confirmed) return
      splittingRef.current = true
      try {
        await NativeLocationService.addBoundaryOverrides([
          {
            before_timestamp: trip.locations[idx - 1].timestamp ?? 0,
            after_timestamp: trip.locations[idx].timestamp ?? 0,
            action: BOUNDARY_ACTION_SPLIT
          }
        ])
        // This trip no longer exists in the form we are showing, and the day view refetches
        // on focus, so going back is what applies the new boundary.
        navigation.goBack()
      } catch (error) {
        logger.error("[TripDetail] Split failed:", error)
        showAlert("Split Failed", "Unable to split the trip here. Please try again.", "error")
      } finally {
        splittingRef.current = false
      }
    },
    [trip, boundaryOverrides, boundariesLoaded, navigation]
  )

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      try {
        const dateStr = new Date(trip.startTime * 1000).toISOString().slice(0, 10)
        const fileName = `colota_trip${trip.index}_${dateStr}${EXPORT_FORMATS[format].extension}`
        const filePath = await NativeLocationService.exportTripsToFile(
          [{ index: trip.index, color: getTripColor(trip.index), startTs: trip.startTime, endTs: trip.endTime }],
          format,
          fileName
        )
        await NativeLocationService.shareFile(
          filePath,
          EXPORT_FORMATS[format].mimeType,
          `Colota ${displayName} - ${dateStr}`
        )
      } catch (error) {
        logger.error("[TripDetail] Export failed:", error)
        showAlert("Export Failed", "Unable to export. Please try again.", "error")
      }
    },
    [trip, displayName]
  )

  const handleDelete = useCallback(async () => {
    const confirmed = await showConfirm({
      title: `Delete ${displayName}?`,
      message: `This permanently removes ${trip.locationCount} location point${
        trip.locationCount === 1 ? "" : "s"
      } from this device. Unsent points will not be uploaded.`,
      confirmText: "Delete",
      destructive: true
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await NativeLocationService.deleteLocationsInRange(trip.startTime, trip.endTime)
      navigation.goBack()
    } catch (error) {
      logger.error("[TripDetail] Delete failed:", error)
      showAlert("Delete Failed", "Unable to delete trip. Please try again.", "error")
      setDeleting(false)
    }
  }, [trip, displayName, navigation])

  const headerRight = useCallback(
    () => (
      <View style={styles.headerActions}>
        <HeaderAction icon={Upload} label="Export trip" onPress={() => setExportOpen(true)} testID="export-trip-btn" />
        <HeaderAction
          icon={Trash2}
          label="Delete trip"
          color={colors.error}
          disabled={deleting}
          onPress={handleDelete}
          testID="delete-trip-btn"
        />
      </View>
    ),
    [handleDelete, deleting, colors.error]
  )

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight })
  }, [navigation, headerRight])

  const speedProfile = useMemo(() => {
    const raw = trip.locations.filter((loc) => loc.speed != null).map((loc) => loc.speed ?? 0)
    return downsample(raw, MAX_BARS)
  }, [trip])

  const elevationProfile = useMemo(() => {
    const raw = trip.locations.filter((loc) => loc.altitude != null).map((loc) => loc.altitude ?? 0)
    return downsample(raw, MAX_BARS)
  }, [trip])

  const maxSpeed = useMemo(() => speedProfile.reduce((max, v) => Math.max(max, v), 0), [speedProfile])
  const minElevation = useMemo(
    () => elevationProfile.reduce((min, v) => Math.min(min, v), Infinity),
    [elevationProfile]
  )
  const maxElevation = useMemo(
    () => elevationProfile.reduce((max, v) => Math.max(max, v), -Infinity),
    [elevationProfile]
  )
  const elevationRange = maxElevation - minElevation

  const selectedPoint = selectedPointId == null ? undefined : trip.locations.find((l) => l.id === selectedPointId)
  const dockInset = selectedPoint ? dockHeight : 0
  const edgeStart = space.lg + insets.left
  const edgeEnd = space.lg + insets.right
  const controlsBottom = space.lg + dockInset + space.sm
  const cameraPadding = useMemo(
    () => ({
      top: space.lg,
      bottom: dockInset + space.lg + space.lg,
      left: edgeStart,
      right: edgeEnd + size.iconColumn + space.lg
    }),
    [dockInset, edgeStart, edgeEnd]
  )

  return (
    <Container>
      <StepperHeader
        title={displayName}
        caption={`${formatDate(trip.startTime)} · ${formatTime(trip.startTime, true)} - ${formatTime(trip.endTime, true)}`}
        leading={<TripSwatch index={trip.index} />}
        onPrevious={() => goToTrip(prevTrip)}
        onNext={() => goToTrip(nextTrip)}
        previousLabel="Previous trip"
        nextLabel="Next trip"
        previousDisabled={!prevTrip}
        nextDisabled={!nextTrip}
        testID="trip"
      />
      <View style={{ height: mapHeight }}>
        <TrackMap
          locations={trip.locations}
          colors={colors}
          trackColor={tripColor}
          fitVersion={trip.index}
          noteOverrides={noteOverrides}
          selectedPointId={selectedPointId}
          onSelectPoint={setSelectedPointId}
          onFocusTrip={() => {}}
          cameraPadding={cameraPadding}
          controlsBottom={controlsBottom}
          controlsEnd={edgeEnd}
        />
        {selectedPoint && selectedPointId != null && (
          <InspectorDock
            content={{
              kind: "point",
              point: selectedPoint,
              note: selectedPointId in noteOverrides ? noteOverrides[selectedPointId] : selectedPoint.note,
              hasEndpoint,
              onSplit: () => handlePointSplit(selectedPointId),
              onClose: () => setSelectedPointId(null),
              onSaveNote: (note) => handlePointNoteChange(selectedPointId, note)
            }}
            left={edgeStart}
            right={edgeEnd}
            maxHeight={mapHeight * DOCK_MAP_SHARE}
            onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
          />
        )}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Card rows>
            <StatRow icon={Route} label="Distance" value={formatDistance(trip.distance)} />
            <Divider tight inset />
            <StatRow icon={Clock} label="Duration" value={formatDuration(duration)} />
            <Divider tight inset />
            <StatRow icon={Gauge} label="Avg speed" value={formatSpeed(stats.avgSpeed)} />
            <Divider tight inset />
            <StatRow icon={MapPin} label="Points" value={String(trip.locationCount)} />
            {stats.elevationGain > 0 && (
              <>
                <Divider tight inset />
                <StatRow icon={TrendingUp} label="Elev. gain" value={`${Math.round(stats.elevationGain)}m`} />
              </>
            )}
            {stats.elevationLoss > 0 && (
              <>
                <Divider tight inset />
                <StatRow icon={TrendingDown} label="Elev. loss" value={`${Math.round(stats.elevationLoss)}m`} />
              </>
            )}
          </Card>
        </View>

        {/* Speed profile */}
        {speedProfile.length > 2 && (
          <View style={styles.section}>
            <View style={styles.chartTitleRow}>
              <SectionTitle>Speed</SectionTitle>
              <Text style={[styles.chartRange, { color: colors.textSecondary }]}>max {formatSpeed(maxSpeed)}</Text>
            </View>
            <Card style={styles.chartCard}>
              <View
                accessibilityRole="image"
                accessibilityLabel={`Speed over the trip, average ${formatSpeed(stats.avgSpeed)}, maximum ${formatSpeed(maxSpeed)}`}
              >
                <InteractiveLineChart
                  data={speedProfile}
                  color={colors.primary}
                  textColor={colors.text}
                  backgroundColor={colors.card}
                  formatValue={(v) => formatSpeed(v).replace(/\.\d+/, "")}
                  activeIndex={chartActiveIndex}
                  onActiveIndexChange={setChartActiveIndex}
                />
              </View>
              <View style={styles.chartLabels}>
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                  <Text key={frac} style={[styles.chartLabel, { color: colors.textSecondary }]}>
                    {formatTime(Math.round(trip.startTime + frac * duration))}
                  </Text>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* Elevation profile */}
        {elevationProfile.length > 2 && elevationRange > 0 && (
          <View style={styles.section}>
            <View style={styles.chartTitleRow}>
              <SectionTitle>Elevation</SectionTitle>
              <Text style={[styles.chartRange, { color: colors.textSecondary }]}>
                {Math.round(minElevation)}m - {Math.round(maxElevation)}m
              </Text>
            </View>
            <Card style={styles.chartCard}>
              <InteractiveLineChart
                data={elevationProfile}
                color={colors.primary}
                textColor={colors.text}
                backgroundColor={colors.card}
                formatValue={(v) => `${Math.round(v)}m`}
                activeIndex={chartActiveIndex}
                onActiveIndexChange={setChartActiveIndex}
              />
              <View style={styles.chartLabels}>
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                  <Text key={frac} style={[styles.chartLabel, { color: colors.textSecondary }]}>
                    {formatDistance(trip.distance * frac)}
                  </Text>
                ))}
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
      <ExportFormatDialog
        visible={exportOpen}
        title={`Export ${displayName}`}
        message={`${formatDate(trip.startTime)} · ${formatDistance(trip.distance)} · ${formatDuration(duration)}`}
        onSelect={(format) => {
          setExportOpen(false)
          handleExport(format)
        }}
        onRequestClose={() => setExportOpen(false)}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.xxl
  },
  section: {
    paddingHorizontal: space.lg,
    marginTop: space.md
  },

  chartCard: {
    padding: space.md
  },
  chartTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.sm
  },
  chartRange: {
    fontSize: fontSizes.small,
    ...fonts.regular
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.xs,
    paddingStart: size.iconColumn
  },
  chartLabel: {
    fontSize: fontSizes.micro,
    ...fonts.regular
  },
  headerActions: {
    flexDirection: "row"
  }
})
