/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo } from "react"
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native"
import { Clock, Route, Share, TrendingUp, TrendingDown, Gauge } from "lucide-react-native"
import { Card } from "../../ui/Card"
import { fonts } from "../../../styles/typography"
import { formatDistance, formatDuration, formatSpeed, formatTime } from "../../../utils/geo"
import type { Trip, ThemeColors } from "../../../types/global"
import { getTripColor, computeTripStats, type TripStats } from "../../../utils/trips"
import { EXPORT_FORMATS, EXPORT_FORMAT_KEYS, type ExportFormat } from "../../../utils/exportConverters"

interface TripListProps {
  trips: Trip[]
  colors: ThemeColors
  onTripSelect: (trip: Trip) => void
  selectedTripIndex?: number | null
  onExport?: (format: ExportFormat) => void
  onExportTrip?: (format: ExportFormat, trip: Trip) => void
}

export function TripList({ trips, colors, onTripSelect, selectedTripIndex, onExport, onExportTrip }: TripListProps) {
  const [showExport, setShowExport] = useState(false)
  const [exportingTripIndex, setExportingTripIndex] = useState<number | null>(null)
  const totalDistance = trips.reduce((sum, t) => sum + t.distance, 0)

  const statsCache = useMemo(() => {
    const map = new Map<number, TripStats>()
    for (const trip of trips) {
      map.set(trip.index, computeTripStats(trip.locations))
    }
    return map
  }, [trips])

  const renderTrip = useCallback(
    ({ item }: { item: Trip }) => {
      const duration = item.endTime - item.startTime
      const tripColor = getTripColor(item.index)
      const isSelected = selectedTripIndex === item.index
      const showTripExport = exportingTripIndex === item.index
      const stats = statsCache.get(item.index)

      return (
        <Card
          variant="interactive"
          onPress={() => onTripSelect(item)}
          style={[
            styles.tripCard,
            { borderLeftColor: tripColor },
            isSelected && [styles.tripCardSelected, { borderColor: tripColor }]
          ]}
        >
          <View style={styles.tripHeader}>
            <View style={styles.tripTitleRow}>
              <View style={[styles.tripDot, { backgroundColor: tripColor }]} />
              <Text style={[styles.tripTitle, { color: colors.text }]}>Trip {item.index}</Text>
            </View>
            <View style={styles.tripTitleRow}>
              <Text style={[styles.tripTime, { color: colors.textSecondary }]}>
                {formatTime(item.startTime)} - {formatTime(item.endTime)}
              </Text>
              {onExportTrip && (
                <Pressable
                  onPress={() => setExportingTripIndex((prev) => (prev === item.index ? null : item.index))}
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                >
                  <Share size={14} color={showTripExport ? colors.primary : colors.textSecondary} />
                </Pressable>
              )}
            </View>
          </View>

          {showTripExport && onExportTrip && (
            <View style={styles.tripExportRow}>
              {EXPORT_FORMAT_KEYS.map((fmt) => (
                <Pressable
                  key={fmt}
                  onPress={() => {
                    onExportTrip(fmt, item)
                    setExportingTripIndex(null)
                  }}
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

          <View style={styles.tripStats}>
            <View style={styles.stat}>
              <Route size={13} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.text }]}>{formatDistance(item.distance)}</Text>
            </View>
            <View style={styles.stat}>
              <Clock size={13} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.text }]}>{formatDuration(duration)}</Text>
            </View>
            {stats && stats.avgSpeed > 0 && (
              <View style={styles.stat}>
                <Gauge size={13} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.text }]}>{formatSpeed(stats.avgSpeed)}</Text>
              </View>
            )}
            {stats && stats.elevationGain > 0 && (
              <View style={styles.stat}>
                <TrendingUp size={13} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.text }]}>{Math.round(stats.elevationGain)}m</Text>
              </View>
            )}
            {stats && stats.elevationLoss > 0 && (
              <View style={styles.stat}>
                <TrendingDown size={13} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.text }]}>{Math.round(stats.elevationLoss)}m</Text>
              </View>
            )}
          </View>
        </Card>
      )
    },
    [colors, onTripSelect, selectedTripIndex, onExportTrip, exportingTripIndex, statsCache]
  )

  if (trips.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Route size={40} color={colors.textDisabled} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No trips for this day</Text>
        <Text style={[styles.emptyHint, { color: colors.textDisabled }]}>Need at least 2 points to form a trip</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.summary, { color: colors.textSecondary }]}>
          {trips.length} {trips.length === 1 ? "trip" : "trips"} · {formatDistance(totalDistance)}
        </Text>
        {onExport && (
          <Pressable
            onPress={() => setShowExport((prev) => !prev)}
            style={({ pressed }) => [styles.exportAllBtn, pressed && { opacity: 0.6 }]}
          >
            <Share size={14} color={showExport ? colors.primary : colors.textSecondary} />
            <Text style={[styles.exportAllLabel, { color: showExport ? colors.primary : colors.textSecondary }]}>
              Export All
            </Text>
          </Pressable>
        )}
      </View>
      {showExport && onExport && (
        <View style={styles.exportRow}>
          {EXPORT_FORMAT_KEYS.map((fmt) => (
            <Pressable
              key={fmt}
              onPress={() => {
                onExport(fmt)
                setShowExport(false)
              }}
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
      <FlatList
        data={trips}
        renderItem={renderTrip}
        keyExtractor={(item) => `trip-${item.index}`}
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8
  },
  summary: {
    fontSize: 12,
    ...fonts.semiBold
  },
  exportAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 6
  },
  exportAllLabel: {
    fontSize: 11,
    ...fonts.semiBold
  },
  exportRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  exportChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1
  },
  exportChipText: {
    fontSize: 11,
    ...fonts.bold
  },
  tripExportRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 16
  },
  tripCard: {
    marginBottom: 8,
    borderLeftWidth: 3
  },
  tripCardSelected: {
    borderWidth: 1.5
  },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  tripTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  tripDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  tripTitle: {
    fontSize: 15,
    ...fonts.bold
  },
  tripTime: {
    fontSize: 13,
    ...fonts.regular
  },
  tripStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  statText: {
    fontSize: 13,
    ...fonts.regular
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 60
  },
  emptyText: {
    fontSize: 14,
    ...fonts.regular
  },
  emptyHint: {
    fontSize: 12,
    ...fonts.regular
  }
})
