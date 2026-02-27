/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo, useState, useCallback } from "react"
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native"
import { Route, Clock, Gauge, TrendingUp, TrendingDown, MapPin, Share, type LucideIcon } from "lucide-react-native"
import { useTheme } from "../hooks/useTheme"
import { fonts } from "../styles/typography"
import { Card } from "../components/ui/Card"
import { Container } from "../components/ui/Container"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { getTripColor, computeTripStats } from "../utils/trips"
import { formatDate, formatDistance, formatDuration, formatSpeed, formatTime } from "../utils/geo"
import { TRIP_CONVERTERS, EXPORT_FORMATS, EXPORT_FORMAT_KEYS, type ExportFormat } from "../utils/exportConverters"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import NativeLocationService from "../services/NativeLocationService"
import type { Trip, ThemeColors } from "../types/global"

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

export function TripDetailScreen({ route }: { navigation: any; route: any }) {
  const { colors } = useTheme()
  const trip: Trip = route.params.trip
  const tripColor = getTripColor(trip.index)

  const stats = useMemo(() => computeTripStats(trip.locations), [trip])
  const duration = trip.endTime - trip.startTime
  const displayName = `Trip ${trip.index}`

  const [showExport, setShowExport] = useState(false)

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      try {
        const content = TRIP_CONVERTERS[format]([trip])
        const dateStr = new Date(trip.startTime * 1000).toISOString().slice(0, 10)
        const fileName = `colota_trip${trip.index}_${dateStr}${EXPORT_FORMATS[format].extension}`
        const filePath = await NativeLocationService.writeFile(fileName, content)
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
      <ScrollView contentContainerStyle={styles.content}>
        {/* Map */}
        <View style={styles.mapContainer}>
          <TrackMap locations={trip.locations} selectedPoint={null} colors={colors} fitVersion={1} />
        </View>

        {/* Header */}
        <View style={styles.section}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.dot, { backgroundColor: tripColor }]} />
            <Text style={[styles.title, { color: colors.text }]}>{displayName}</Text>
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {formatDate(trip.startTime)} · {formatTime(trip.startTime, true)} - {formatTime(trip.endTime, true)}
          </Text>
        </View>

        {/* Stats grid */}
        <View style={[styles.statsGrid, styles.section]}>
          <StatCard icon={Route} label="Distance" value={formatDistance(trip.distance)} colors={colors} />
          <StatCard icon={Clock} label="Duration" value={formatDuration(duration)} colors={colors} />
          <StatCard icon={Gauge} label="Avg Speed" value={formatSpeed(stats.avgSpeed)} colors={colors} />
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
              <View style={styles.chartBody}>
                <View style={styles.yAxis}>
                  <Text style={[styles.yLabel, { color: colors.textSecondary }]}>{formatSpeed(maxSpeed)}</Text>
                  <Text style={[styles.yLabel, { color: colors.textSecondary }]}>0</Text>
                </View>
                <View style={styles.chartContainer}>
                  {speedProfile.map((speed, i) => {
                    const height = maxSpeed > 0 ? (speed / maxSpeed) * 100 : 0
                    return (
                      <View
                        key={i}
                        style={[styles.bar, { height: `${Math.max(height, 2)}%`, backgroundColor: tripColor }]}
                      />
                    )
                  })}
                </View>
              </View>
              <View style={styles.chartLabels}>
                <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>{formatTime(trip.startTime)}</Text>
                <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>{formatTime(trip.endTime)}</Text>
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
              <View style={styles.chartBody}>
                <View style={styles.yAxis}>
                  <Text style={[styles.yLabel, { color: colors.textSecondary }]}>{Math.round(maxElevation)}m</Text>
                  <Text style={[styles.yLabel, { color: colors.textSecondary }]}>{Math.round(minElevation)}m</Text>
                </View>
                <View style={styles.chartContainer}>
                  {elevationProfile.map((alt, i) => {
                    const height = elevationRange > 0 ? ((alt - minElevation) / elevationRange) * 100 : 0
                    return (
                      <View
                        key={i}
                        style={[
                          styles.bar,
                          { height: `${Math.max(height, 2)}%`, backgroundColor: colors.primary + "80" }
                        ]}
                      />
                    )
                  })}
                </View>
              </View>
              <View style={styles.chartLabels}>
                <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>{formatTime(trip.startTime)}</Text>
                <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>{formatTime(trip.endTime)}</Text>
              </View>
            </Card>
          </View>
        )}

        {/* Export */}
        <View style={styles.section}>
          <Pressable
            onPress={() => setShowExport((prev) => !prev)}
            style={({ pressed }) => [
              styles.exportBtn,
              { backgroundColor: colors.primary, borderRadius: colors.borderRadius },
              pressed && { opacity: 0.8 }
            ]}
          >
            <Share size={16} color={colors.textOnPrimary} />
            <Text style={[styles.exportBtnText, { color: colors.textOnPrimary }]}>Export Trip</Text>
          </Pressable>

          {showExport && (
            <View style={styles.exportRow}>
              {EXPORT_FORMAT_KEYS.map((fmt) => (
                <Pressable
                  key={fmt}
                  onPress={() => handleExport(fmt)}
                  style={({ pressed }) => [
                    styles.exportChip,
                    { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" },
                    pressed && { opacity: 0.7 }
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
      <Icon size={16} color={colors.primary} />
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 12
  },
  mapContainer: {
    height: 250
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  title: {
    fontSize: 20,
    ...fonts.bold
  },
  subtitle: {
    fontSize: 13,
    ...fonts.regular,
    marginLeft: 22
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statCard: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    minWidth: "30%",
    flex: 1
  },
  statValue: {
    fontSize: 16,
    ...fonts.bold
  },
  statLabel: {
    fontSize: 11,
    ...fonts.regular,
    textTransform: "uppercase"
  },
  chartCard: {
    padding: 12
  },
  chartTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  chartTitle: {
    fontSize: 14,
    ...fonts.semiBold
  },
  chartRange: {
    fontSize: 11,
    ...fonts.regular
  },
  chartBody: {
    flexDirection: "row"
  },
  yAxis: {
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginRight: 6,
    width: 52
  },
  yLabel: {
    fontSize: 9,
    ...fonts.regular
  },
  chartContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 80,
    flex: 1,
    gap: 1
  },
  bar: {
    borderRadius: 2,
    flex: 1
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4
  },
  chartLabel: {
    fontSize: 10,
    ...fonts.regular
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14
  },
  exportBtnText: {
    fontSize: 15,
    ...fonts.semiBold
  },
  exportRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 12
  },
  exportChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1
  },
  exportChipText: {
    fontSize: 12,
    ...fonts.bold
  }
})
