/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, Share, Trash2 } from "lucide-react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import { text } from "../styles/typography"
import { Button, Card, Container, Divider, Figure, MapOverlay, StatRow } from "../components"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { CHART_PADDING, InteractiveLineChart } from "../components/features/inspector/InteractiveLineChart"
import { getTripColor, computeTripStats, buildBoundaryOverrideMap, splitBlockedReason } from "../utils/trips"
import { formatDate, formatDistance, formatDuration, formatShortDistance, formatSpeed, formatTime } from "../utils/geo"
import { EXPORT_FORMATS, EXPORT_FORMAT_KEYS, type ExportFormat } from "../utils/exportConverters"
import { size, space, MAP_OVERLAY_GUTTER, TRIP_MAP_FRACTION } from "../constants"
import { showAlert, showChoice, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import NativeLocationService from "../services/NativeLocationService"
import { BOUNDARY_ACTION_SPLIT } from "../types/global"
import type { Trip, BoundaryAction } from "../types/global"
import type { RootScreenProps } from "../types/navigation"

const MAX_BARS = 120
const DOT_SIZE = 12
const CHART_TICKS = [0, 0.25, 0.5, 0.75, 1]

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
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const trip: Trip = route.params.trip
  const trips: Trip[] = route.params.trips
  const tripColor = getTripColor(trip.index)
  const [deleting, setDeleting] = useState(false)
  // The map reads a note back when the point is re-tapped, and the chevrons swap in a trip from
  // route.params, so a saved note has to be held here rather than inside the map.
  const [noteOverrides, setNoteOverrides] = useState<Record<number, string | undefined>>({})

  const stats = useMemo(() => computeTripStats(trip.locations), [trip])
  const duration = trip.endTime - trip.startTime
  const displayName = t("tripDetail.title", { index: trip.index })
  const mapHeight = Math.round(windowHeight * TRIP_MAP_FRACTION)

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

  const currentIdx = trips.findIndex((t2) => t2.index === trip.index)
  const prevTrip = currentIdx > 0 ? trips[currentIdx - 1] : null
  const nextTrip = currentIdx >= 0 && currentIdx < trips.length - 1 ? trips[currentIdx + 1] : null

  // Reset transient UI state when switching to a different trip.
  useEffect(() => {
    setChartActiveIndex(null)
  }, [trip.index])

  const goToTrip = useCallback(
    (target: Trip | null) => {
      if (!target) return
      navigation.setParams({ trip: target })
    },
    [navigation]
  )

  const handlePointNoteChange = useCallback(
    async (id: number, note: string | null) => {
      try {
        await NativeLocationService.updateLocationNote(id, note)
        setNoteOverrides((prev) => ({ ...prev, [id]: note ?? undefined }))
      } catch (error) {
        logger.error("[TripDetail] Note update failed:", error)
        showAlert(t("history.note.failed"), t("history.note.failed.message"), "error")
      }
    },
    [t]
  )

  const splittingRef = useRef(false)
  const handlePointSplit = useCallback(
    async (id: number) => {
      if (splittingRef.current) return
      if (!boundariesLoaded) {
        showAlert(t("history.split.blocked"), t("history.split.loading"), "info")
        return
      }
      // A trip's locations are a contiguous run of the day, so the preceding point is the one
      // that ends the trip.
      const idx = trip.locations.findIndex((l) => l.id === id)
      const blocked = splitBlockedReason(trip.locations, idx, boundaryOverrides)
      if (blocked) {
        showAlert(t("history.split.blocked"), blocked, "info")
        return
      }
      const at = trip.locations[idx].timestamp
      const confirmed = await showConfirm({
        // The confirm covers the popup, so name the point in it
        title: at ? t("history.split.title", { time: formatTime(at, true) }) : t("history.split.titleUnknown"),
        message: t("history.split.message"),
        confirmText: t("history.split.confirm")
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
        showAlert(t("history.split.failed"), t("history.split.failed.message"), "error")
      } finally {
        splittingRef.current = false
      }
    },
    [trip, boundaryOverrides, boundariesLoaded, navigation, t]
  )

  const runExport = useCallback(
    async (format: ExportFormat) => {
      try {
        const dateStr = new Date(trip.startTime * 1000).toISOString().slice(0, 10)
        const fileName = `colota_trip${trip.index}_${dateStr}${EXPORT_FORMATS[format].extension}`
        const filePath = await NativeLocationService.exportTripsToFile(
          [{ index: trip.index, color: tripColor, startTs: trip.startTime, endTs: trip.endTime }],
          format,
          fileName
        )
        await NativeLocationService.shareFile(
          filePath,
          EXPORT_FORMATS[format].mimeType,
          t("history.export.shareTrip", { index: trip.index, date: dateStr })
        )
      } catch (error) {
        logger.error("[TripDetail] Export failed:", error)
        showAlert(t("tripDetail.export.failed"), t("tripDetail.export.failed.message"), "error")
      }
    },
    [trip, tripColor, t]
  )

  const exportingRef = useRef(false)
  const handleExport = useCallback(async () => {
    if (exportingRef.current) return
    exportingRef.current = true
    try {
      const chosen = await showChoice({
        title: t("tripDetail.export.title"),
        message: t("tripDetail.export.message"),
        variant: "info",
        buttons: [
          ...EXPORT_FORMAT_KEYS.map((fmt) => ({ text: EXPORT_FORMATS[fmt].label, style: "secondary" as const })),
          { text: t("tripDetail.export.cancel"), style: "secondary" as const }
        ]
      })
      if (chosen < 0 || chosen >= EXPORT_FORMAT_KEYS.length) return
      await runExport(EXPORT_FORMAT_KEYS[chosen])
    } finally {
      exportingRef.current = false
    }
  }, [runExport, t])

  const handleDelete = useCallback(async () => {
    if (deleting) return
    const confirmed = await showConfirm({
      title: t("tripDetail.delete.title", { index: trip.index }),
      message: t("tripDetail.delete.message", { count: trip.locationCount }),
      confirmText: t("tripDetail.delete.confirm"),
      destructive: true
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await NativeLocationService.deleteLocationsInRange(trip.startTime, trip.endTime)
      navigation.goBack()
    } catch (error) {
      logger.error("[TripDetail] Delete failed:", error)
      showAlert(t("tripDetail.delete.failed"), t("tripDetail.delete.failed.message"), "error")
      setDeleting(false)
    }
  }, [trip, deleting, navigation, t])

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

  const speedRange = t("tripDetail.chart.speedRange", { value: formatSpeed(maxSpeed) })
  const elevationRangeLabel = t("tripDetail.chart.elevationRange", {
    min: formatShortDistance(minElevation),
    max: formatShortDistance(maxElevation)
  })

  const [distanceValue, distanceUnit] = formatDistance(trip.distance).split(" ")

  return (
    <Container>
      <View style={[styles.map, { height: mapHeight }]}>
        <TrackMap
          locations={trip.locations}
          colors={colors}
          trackColor={tripColor}
          fitVersion={trip.index}
          noteOverrides={noteOverrides}
          onPointNoteChange={handlePointNoteChange}
          onPointSplit={handlePointSplit}
        />
        <View
          pointerEvents="box-none"
          style={[
            styles.chrome,
            {
              top: insets.top + MAP_OVERLAY_GUTTER,
              start: insets.left + MAP_OVERLAY_GUTTER,
              end: insets.right + MAP_OVERLAY_GUTTER
            }
          ]}
        >
          <MapOverlay
            testID="trip-back-btn"
            variant="control"
            onPress={() => navigation.goBack()}
            accessibilityLabel={t("tripDetail.back")}
          >
            <ArrowLeft size={size.icon.md} color={colors.text} />
          </MapOverlay>
          <View style={styles.chromeEnd}>
            <MapOverlay
              testID="trip-share-btn"
              variant="control"
              onPress={handleExport}
              accessibilityLabel={t("tripDetail.export")}
            >
              <Share size={size.icon.md} color={colors.text} />
            </MapOverlay>
            <MapOverlay
              testID="trip-delete-btn"
              variant="control"
              onPress={handleDelete}
              accessibilityLabel={t("tripDetail.delete")}
            >
              <Trash2 size={size.icon.md} color={colors.error} />
            </MapOverlay>
          </View>
        </View>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Card variant="sheet" style={styles.sheetBody}>
          <View style={styles.titleRow}>
            <View style={[styles.dot, { backgroundColor: tripColor }]} importantForAccessibility="no" />
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {displayName}
            </Text>
          </View>
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            {t("tripDetail.date", {
              date: formatDate(trip.startTime),
              start: formatTime(trip.startTime, true),
              end: formatTime(trip.endTime, true)
            })}
          </Text>

          <View style={styles.figure}>
            <Figure testID="trip-distance" value={distanceValue} unit={distanceUnit} label={t("tripDetail.distance")} />
          </View>

          <StatRow label={t("tripDetail.duration")} value={formatDuration(duration)} divider />
          <StatRow label={t("tripDetail.avgSpeed")} value={formatSpeed(stats.avgSpeed)} divider />
          <StatRow
            label={t("tripDetail.points")}
            value={trip.locationCount.toLocaleString()}
            divider={stats.elevationGain > 0 || stats.elevationLoss > 0}
          />
          {stats.elevationGain > 0 && (
            <StatRow
              label={t("tripDetail.elevationGain")}
              value={formatShortDistance(stats.elevationGain)}
              divider={stats.elevationLoss > 0}
            />
          )}
          {stats.elevationLoss > 0 && (
            <StatRow label={t("tripDetail.elevationLoss")} value={formatShortDistance(stats.elevationLoss)} />
          )}

          {speedProfile.length > 2 && (
            <View style={styles.chart}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>{t("tripDetail.chart.speed")}</Text>
                <Text style={[styles.chartRange, { color: colors.textSecondary }]}>{speedRange}</Text>
              </View>
              <InteractiveLineChart
                data={speedProfile}
                color={colors.info}
                textColor={colors.text}
                axisColor={colors.border}
                backgroundColor={colors.card}
                formatValue={(v) => formatSpeed(v).replace(/\.\d+/, "")}
                activeIndex={chartActiveIndex}
                onActiveIndexChange={setChartActiveIndex}
                accessibilityLabel={t("tripDetail.chart.a11y", {
                  title: t("tripDetail.chart.speed"),
                  range: speedRange
                })}
              />
              <View style={styles.chartLabels}>
                {CHART_TICKS.map((frac) => (
                  <Text key={frac} style={[styles.chartLabel, { color: colors.textSecondary }]}>
                    {formatTime(Math.round(trip.startTime + frac * duration))}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {elevationProfile.length > 2 && elevationRange > 0 && (
            <View style={styles.chart}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>{t("tripDetail.chart.elevation")}</Text>
                <Text style={[styles.chartRange, { color: colors.textSecondary }]}>{elevationRangeLabel}</Text>
              </View>
              <InteractiveLineChart
                data={elevationProfile}
                color={colors.primary}
                textColor={colors.text}
                axisColor={colors.border}
                backgroundColor={colors.card}
                formatValue={(v) => formatShortDistance(v)}
                activeIndex={chartActiveIndex}
                onActiveIndexChange={setChartActiveIndex}
                accessibilityLabel={t("tripDetail.chart.a11y", {
                  title: t("tripDetail.chart.elevation"),
                  range: elevationRangeLabel
                })}
              />
              <View style={styles.chartLabels}>
                {CHART_TICKS.map((frac) => (
                  <Text key={frac} style={[styles.chartLabel, { color: colors.textSecondary }]}>
                    {formatDistance(trip.distance * frac)}
                  </Text>
                ))}
              </View>
            </View>
          )}

          <View style={styles.exportSlot}>
            <Button
              testID="export-trip-btn"
              variant="ghost"
              align="start"
              icon={Share}
              title={t("tripDetail.export")}
              onPress={handleExport}
            />
          </View>

          <Divider tight />

          <View style={styles.footer}>
            <Button
              testID="previous-trip-btn"
              variant="ghost"
              align="start"
              title={t("tripDetail.previous")}
              disabled={!prevTrip}
              onPress={() => goToTrip(prevTrip)}
              style={styles.footerBtn}
            />
            <Button
              testID="next-trip-btn"
              variant="ghost"
              title={t("tripDetail.next")}
              disabled={!nextTrip}
              onPress={() => goToTrip(nextTrip)}
              style={styles.footerBtn}
            />
          </View>
        </Card>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  map: {
    width: "100%"
  },
  chrome: {
    position: "absolute",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chromeEnd: {
    flexDirection: "row",
    gap: space.sm
  },
  sheet: {
    flex: 1
  },
  sheetContent: {
    flexGrow: 1
  },
  sheetBody: {
    paddingBottom: space.xxl
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.pill
  },
  title: {
    ...text.title
  },
  date: {
    ...text.caption
  },
  figure: {
    marginTop: space.lg,
    marginBottom: space.md
  },
  chart: {
    marginTop: space.xl
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.sm
  },
  chartTitle: {
    ...text.label
  },
  chartRange: {
    ...text.caption
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.xs,
    paddingStart: CHART_PADDING.left
  },
  chartLabel: {
    ...text.caption
  },
  exportSlot: {
    marginTop: space.xl,
    marginBottom: space.md
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.sm
  },
  footerBtn: {
    flex: 1
  }
})
