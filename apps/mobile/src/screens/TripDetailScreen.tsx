/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo, useState, useCallback, useLayoutEffect, useEffect, useRef } from "react"
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native"
import {
  Route,
  Clock,
  Gauge,
  TrendingUp,
  TrendingDown,
  MapPin,
  Share,
  Trash2,
  ChevronLeft,
  ChevronRight,
  type LucideIcon
} from "lucide-react-native"
import { useTheme } from "../hooks/useTheme"
import { fontSizes, fonts } from "../styles/typography"
import { Button } from "../components/ui/Button"
import { Card } from "../components/ui/Card"
import { Container } from "../components/ui/Container"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { InteractiveLineChart } from "../components/features/inspector/InteractiveLineChart"
import { getTripColor, computeTripStats, buildBoundaryOverrideMap, splitBlockedReason } from "../utils/trips"
import { formatDate, formatDistance, formatDuration, formatSpeed, formatTime } from "../utils/geo"
import { EXPORT_FORMATS, EXPORT_FORMAT_KEYS, type ExportFormat } from "../utils/exportConverters"
import { HIT_SLOP_LG, size, space } from "../constants"
import { showAlert, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import NativeLocationService from "../services/NativeLocationService"
import { BOUNDARY_ACTION_SPLIT } from "../types/global"
import type { Trip, ThemeColors, BoundaryAction } from "../types/global"
import type { RootScreenProps } from "../types/navigation"
import { radius } from "@colota/shared"

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

export function TripDetailScreen({ route, navigation }: RootScreenProps<"Trip Detail">) {
  const { colors } = useTheme()
  const trip: Trip = route.params.trip
  const trips: Trip[] = route.params.trips
  const tripColor = getTripColor(trip.index)
  const [deleting, setDeleting] = useState(false)
  // The map reads a note back when the point is re-tapped, and the chevrons swap in a trip from
  // route.params, so a saved note has to be held here rather than inside the map.
  const [noteOverrides, setNoteOverrides] = useState<Record<number, string | undefined>>({})

  const stats = useMemo(() => computeTripStats(trip.locations), [trip])
  const duration = trip.endTime - trip.startTime
  const displayName = `Trip ${trip.index}`

  const [showExport, setShowExport] = useState(false)
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

  const currentIdx = trips.findIndex((t) => t.index === trip.index)
  const prevTrip = currentIdx > 0 ? trips[currentIdx - 1] : null
  const nextTrip = currentIdx >= 0 && currentIdx < trips.length - 1 ? trips[currentIdx + 1] : null

  // Reset transient UI state when switching to a different trip.
  useEffect(() => {
    setChartActiveIndex(null)
    setShowExport(false)
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
        setShowExport(false)
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
      <Pressable
        onPress={handleDelete}
        disabled={deleting}
        hitSlop={8}
        style={({ pressed }) => [styles.headerBtn, (pressed || deleting) && { opacity: colors.pressedOpacity }]}
      >
        <Trash2 size={size.icon.md} color={colors.error} />
      </Pressable>
    ),
    [handleDelete, deleting, colors.error, colors.pressedOpacity]
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

  return (
    <Container>
      <View style={styles.mapContainer}>
        <TrackMap
          locations={trip.locations}
          colors={colors}
          trackColor={tripColor}
          fitVersion={trip.index}
          noteOverrides={noteOverrides}
          onPointNoteChange={handlePointNoteChange}
          onPointSplit={handlePointSplit}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.section}>
          <View style={styles.headerTitleRow}>
            <Pressable
              onPress={() => goToTrip(prevTrip)}
              disabled={!prevTrip}
              hitSlop={HIT_SLOP_LG}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: colors.pressedOpacity }]}
            >
              <ChevronLeft size={size.icon.lg} color={prevTrip ? colors.primary : colors.textDisabled} />
            </Pressable>
            <View style={styles.headerTitleCenter}>
              <View style={styles.headerTitleLine}>
                <View style={[styles.dot, { backgroundColor: tripColor }]} />
                <Text style={[styles.title, { color: colors.text }]}>{displayName}</Text>
              </View>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {formatDate(trip.startTime)} · {formatTime(trip.startTime, true)} - {formatTime(trip.endTime, true)}
              </Text>
            </View>
            <Pressable
              onPress={() => goToTrip(nextTrip)}
              disabled={!nextTrip}
              hitSlop={HIT_SLOP_LG}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: colors.pressedOpacity }]}
            >
              <ChevronRight size={size.icon.lg} color={nextTrip ? colors.primary : colors.textDisabled} />
            </Pressable>
          </View>
        </View>

        {/* Stats grid */}
        <View style={[styles.statsGrid, styles.section]}>
          <StatCard icon={Route} label="Distance" value={formatDistance(trip.distance)} colors={colors} />
          <StatCard icon={Clock} label="Duration" value={formatDuration(duration)} colors={colors} />
          <StatCard icon={Gauge} label="Avg speed" value={formatSpeed(stats.avgSpeed)} colors={colors} />
          <StatCard icon={MapPin} label="Points" value={String(trip.locationCount)} colors={colors} />
          {stats.elevationGain > 0 && (
            <StatCard
              icon={TrendingUp}
              label="Elev. Gain"
              value={`${Math.round(stats.elevationGain)}m`}
              colors={colors}
            />
          )}
          {stats.elevationLoss > 0 && (
            <StatCard
              icon={TrendingDown}
              label="Elev. Loss"
              value={`${Math.round(stats.elevationLoss)}m`}
              colors={colors}
            />
          )}
        </View>

        {/* Speed profile */}
        {speedProfile.length > 2 && (
          <View style={styles.section}>
            <Card style={styles.chartCard}>
              <View style={styles.chartTitleRow}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Speed</Text>
                <Text style={[styles.chartRange, { color: colors.textSecondary }]}>max {formatSpeed(maxSpeed)}</Text>
              </View>
              <InteractiveLineChart
                data={speedProfile}
                color={colors.info}
                textColor={colors.text}
                backgroundColor={colors.card}
                formatValue={(v) => formatSpeed(v).replace(/\.\d+/, "")}
                activeIndex={chartActiveIndex}
                onActiveIndexChange={setChartActiveIndex}
              />
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
            <Card style={styles.chartCard}>
              <View style={styles.chartTitleRow}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Elevation</Text>
                <Text style={[styles.chartRange, { color: colors.textSecondary }]}>
                  {Math.round(minElevation)}m - {Math.round(maxElevation)}m
                </Text>
              </View>
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

        {/* Export */}
        <View style={styles.section}>
          <Button title="Export trip" icon={Share} onPress={() => setShowExport((prev) => !prev)} />

          {showExport && (
            <View style={styles.exportRow}>
              {EXPORT_FORMAT_KEYS.map((fmt) => (
                <Pressable
                  key={fmt}
                  onPress={() => handleExport(fmt)}
                  style={({ pressed }) => [
                    styles.exportChip,
                    { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" },
                    pressed && { opacity: colors.pressedOpacity }
                  ]}
                >
                  <Text style={[styles.exportChipText, { color: colors.primary }]}>{EXPORT_FORMATS[fmt].label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Container>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  colors
}: {
  icon: LucideIcon
  label: string
  value: string
  colors: ThemeColors
}) {
  return (
    <Card style={styles.statCard}>
      <Icon size={size.icon.sm} color={colors.primary} />
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </Card>
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
  mapContainer: {
    height: 480
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: "center",
    gap: space.xs
  },
  headerTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  navBtn: {
    padding: space.xs
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  title: {
    fontSize: fontSizes.cardTitle,
    ...fonts.bold
  },
  subtitle: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    textAlign: "center"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm
  },
  statCard: {
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    minWidth: "30%",
    flex: 1
  },
  statValue: {
    fontSize: fontSizes.label,
    ...fonts.bold
  },
  statLabel: {
    fontSize: fontSizes.small,
    ...fonts.regular
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
  chartTitle: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  chartRange: {
    fontSize: fontSizes.small,
    ...fonts.regular
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.xs,
    paddingStart: 40
  },
  chartLabel: {
    fontSize: fontSizes.micro,
    ...fonts.regular
  },
  exportRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.sm,
    marginTop: space.md
  },
  exportChip: {
    paddingHorizontal: 14,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1
  },
  exportChipText: {
    fontSize: fontSizes.caption,
    ...fonts.bold
  },
  headerBtn: {
    padding: space.sm
  }
})
