/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { View, Text, FlatList, Pressable, StyleSheet, BackHandler } from "react-native"
import { Clock, Route, Share, TrendingUp, TrendingDown, Gauge, Trash2, X, Merge } from "lucide-react-native"
import { Card } from "../../ui/Card"
import { fonts } from "../../../styles/typography"
import { formatDistance, formatDuration, formatSpeed, formatTime } from "../../../utils/geo"
import type { Trip, ThemeColors } from "../../../types/global"
import { getTripColor, computeTripStats, type TripStats } from "../../../utils/trips"
import { EXPORT_FORMATS, EXPORT_FORMAT_KEYS, type ExportFormat } from "../../../utils/exportConverters"
import { HIT_SLOP_SM } from "../../../constants"

interface TripListProps {
  trips: Trip[]
  colors: ThemeColors
  onTripSelect: (trip: Trip) => void
  selectedTripIndex?: number | null
  onExport?: (format: ExportFormat, trips: Trip[]) => void
  onDelete?: (trips: Trip[]) => Promise<void>
  onMerge?: (trips: Trip[]) => Promise<void>
}

interface TripRowProps {
  trip: Trip
  colors: ThemeColors
  stats: TripStats | undefined
  selectionMode: boolean
  isCabSelected: boolean
  isMapSelected: boolean
  onPress: (trip: Trip) => void
  onLongPress: (trip: Trip) => void
}

const TripRow = React.memo(function TripRow({
  trip,
  colors,
  stats,
  selectionMode,
  isCabSelected,
  isMapSelected,
  onPress,
  onLongPress
}: TripRowProps) {
  const duration = trip.endTime - trip.startTime
  const tripColor = getTripColor(trip.index)
  const selectedBorderColor = isCabSelected ? colors.primary : isMapSelected ? tripColor : null

  const cardStyle = [
    styles.tripCard,
    selectedBorderColor && [styles.tripCardSelected, { borderColor: selectedBorderColor }]
  ]

  const accessibilityRole = selectionMode ? "checkbox" : "button"
  const accessibilityState = selectionMode ? { checked: isCabSelected } : undefined
  const accessibilityLabel = selectionMode
    ? `Trip ${trip.index}, ${formatDistance(trip.distance)}, ${formatDuration(duration)}`
    : `Trip ${trip.index}, ${formatDistance(trip.distance)}, ${formatDuration(duration)}, open details`

  return (
    <Card
      variant="interactive"
      onPress={() => onPress(trip)}
      onLongPress={() => onLongPress(trip)}
      style={cardStyle}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={selectionMode ? undefined : "Long-press to select multiple trips"}
    >
      <View style={styles.tripHeader}>
        <View style={styles.tripTitleRow}>
          <View style={[styles.tripDot, { backgroundColor: tripColor }]} />
          <Text style={[styles.tripTitle, { color: colors.text }]}>Trip {trip.index}</Text>
        </View>
        <Text style={[styles.tripTime, { color: colors.textSecondary }]}>
          {formatTime(trip.startTime)} - {formatTime(trip.endTime)}
        </Text>
      </View>

      <View style={styles.tripStats}>
        <View style={styles.stat}>
          <Route size={13} color={colors.textSecondary} />
          <Text style={[styles.statText, { color: colors.text }]}>{formatDistance(trip.distance)}</Text>
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
})

export function TripList({
  trips,
  colors,
  onTripSelect,
  selectedTripIndex,
  onExport,
  onDelete,
  onMerge
}: TripListProps) {
  const [showExport, setShowExport] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const selectionMode = selected.size > 0

  useEffect(() => {
    setSelected(new Set())
    setShowExport(false)
  }, [trips])

  useEffect(() => {
    if (!selectionMode) return
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelected(new Set())
      setShowExport(false)
      return true
    })
    return () => sub.remove()
  }, [selectionMode])

  const selectedTrips = useMemo(() => trips.filter((t) => selected.has(t.index)), [trips, selected])
  const allSelected = selectionMode && selected.size === trips.length
  const isAdjacentSelection = useMemo(() => {
    if (selectedTrips.length < 2) return false
    for (let i = 1; i < selectedTrips.length; i++) {
      if (selectedTrips[i].index !== selectedTrips[i - 1].index + 1) return false
    }
    return true
  }, [selectedTrips])

  const totalDistance = trips.reduce((sum, t) => sum + t.distance, 0)

  const statsCache = useMemo(() => {
    const map = new Map<number, TripStats>()
    for (const trip of trips) {
      map.set(trip.index, computeTripStats(trip.locations))
    }
    return map
  }, [trips])

  const selectionModeRef = useRef(selectionMode)
  selectionModeRef.current = selectionMode
  const onTripSelectRef = useRef(onTripSelect)
  onTripSelectRef.current = onTripSelect

  const handleRowPress = useCallback((trip: Trip) => {
    if (selectionModeRef.current) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(trip.index)) next.delete(trip.index)
        else next.add(trip.index)
        return next
      })
    } else {
      onTripSelectRef.current(trip)
    }
  }, [])

  const handleRowLongPress = useCallback((trip: Trip) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.add(trip.index)
      return next
    })
    setShowExport(false)
  }, [])

  const handleSelectAllToggle = useCallback(() => {
    setSelected((prev) => (prev.size === trips.length ? new Set() : new Set(trips.map((t) => t.index))))
  }, [trips])

  const handleCancelSelection = useCallback(() => {
    setSelected(new Set())
    setShowExport(false)
  }, [])

  const deletingRef = useRef(false)
  const handleDeleteSelected = useCallback(async () => {
    if (!onDelete || selectedTrips.length === 0 || deletingRef.current) return
    deletingRef.current = true
    try {
      await onDelete(selectedTrips)
      setSelected(new Set())
      setShowExport(false)
    } finally {
      deletingRef.current = false
    }
  }, [onDelete, selectedTrips])

  const mergingRef = useRef(false)
  const handleMergeSelected = useCallback(async () => {
    if (!onMerge || !isAdjacentSelection || mergingRef.current) return
    mergingRef.current = true
    try {
      await onMerge(selectedTrips)
      setSelected(new Set())
      setShowExport(false)
    } catch {
      // Caller surfaces its own error UI. Preserve selection so the user can retry.
    } finally {
      mergingRef.current = false
    }
  }, [onMerge, selectedTrips, isAdjacentSelection])

  const renderTrip = useCallback(
    ({ item }: { item: Trip }) => (
      <TripRow
        trip={item}
        colors={colors}
        stats={statsCache.get(item.index)}
        selectionMode={selectionMode}
        isCabSelected={selected.has(item.index)}
        isMapSelected={!selectionMode && selectedTripIndex === item.index}
        onPress={handleRowPress}
        onLongPress={handleRowLongPress}
      />
    ),
    [colors, statsCache, selectionMode, selected, selectedTripIndex, handleRowPress, handleRowLongPress]
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
      {selectionMode ? (
        <View style={[styles.headerRow, { backgroundColor: colors.primary + "12" }]}>
          <View style={styles.cabLeft}>
            <Pressable
              onPress={handleCancelSelection}
              hitSlop={HIT_SLOP_SM}
              style={({ pressed }) => [styles.cabIconBtn, pressed && { opacity: colors.pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel selection"
            >
              <X size={18} color={colors.text} />
            </Pressable>
            <Text style={[styles.cabSummary, { color: colors.text }]}>{selected.size} selected</Text>
          </View>
          <View style={styles.cabActions}>
            <Pressable
              onPress={handleSelectAllToggle}
              hitSlop={HIT_SLOP_SM}
              style={({ pressed }) => [styles.cabTextBtn, pressed && { opacity: colors.pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel={allSelected ? "Clear selection" : "Select all trips"}
            >
              <Text style={[styles.cabTextBtnLabel, { color: allSelected ? colors.primary : colors.text }]}>
                {allSelected ? "Clear" : "All"}
              </Text>
            </Pressable>
            {onExport && (
              <Pressable
                onPress={() => setShowExport((prev) => !prev)}
                hitSlop={HIT_SLOP_SM}
                style={({ pressed }) => [styles.cabIconBtn, pressed && { opacity: colors.pressedOpacity }]}
                accessibilityRole="button"
                accessibilityLabel="Export selected trips"
                accessibilityState={{ expanded: showExport }}
              >
                <Share size={18} color={showExport ? colors.primary : colors.text} />
              </Pressable>
            )}
            {onMerge && trips.length >= 2 && (
              <Pressable
                onPress={handleMergeSelected}
                disabled={!isAdjacentSelection}
                hitSlop={HIT_SLOP_SM}
                style={({ pressed }) => [styles.cabIconBtn, pressed && { opacity: colors.pressedOpacity }]}
                accessibilityRole="button"
                accessibilityLabel="Merge selected trips"
                accessibilityHint={isAdjacentSelection ? undefined : "Select two or more adjacent trips to merge them"}
                accessibilityState={{ disabled: !isAdjacentSelection }}
              >
                <Merge size={18} color={isAdjacentSelection ? colors.text : colors.textDisabled} />
              </Pressable>
            )}
            {onDelete && (
              <Pressable
                onPress={handleDeleteSelected}
                hitSlop={HIT_SLOP_SM}
                style={({ pressed }) => [styles.cabIconBtn, pressed && { opacity: colors.pressedOpacity }]}
                accessibilityRole="button"
                accessibilityLabel="Delete selected trips"
              >
                <Trash2 size={18} color={colors.error} />
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.headerRow}>
          <Text style={[styles.summary, { color: colors.textSecondary }]}>
            {trips.length} {trips.length === 1 ? "trip" : "trips"} · {formatDistance(totalDistance)}
          </Text>
          {onExport && (
            <Pressable
              onPress={() => setShowExport((prev) => !prev)}
              style={({ pressed }) => [styles.exportAllBtn, pressed && { opacity: colors.pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Export all trips"
              accessibilityState={{ expanded: showExport }}
            >
              <Share size={14} color={showExport ? colors.primary : colors.textSecondary} />
              <Text style={[styles.exportAllLabel, { color: showExport ? colors.primary : colors.textSecondary }]}>
                Export All
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {showExport && onExport && (
        <View style={styles.exportRow}>
          {EXPORT_FORMAT_KEYS.map((fmt) => (
            <Pressable
              key={fmt}
              onPress={() => {
                onExport(fmt, selectionMode ? selectedTrips : trips)
                setShowExport(false)
                if (selectionMode) setSelected(new Set())
              }}
              style={({ pressed }) => [
                styles.exportChip,
                { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" },
                pressed && { opacity: colors.pressedOpacity }
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                selectionMode
                  ? `Export ${selectedTrips.length} selected trips as ${EXPORT_FORMATS[fmt].label}`
                  : `Export all trips as ${EXPORT_FORMATS[fmt].label}`
              }
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
        extraData={selected}
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
    paddingTop: 10,
    paddingBottom: 14,
    minHeight: 54
  },
  cabLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1
  },
  cabSummary: {
    fontSize: 13,
    ...fonts.semiBold
  },
  cabActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  cabIconBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  cabTextBtn: {
    minHeight: 48,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  cabTextBtnLabel: {
    fontSize: 13,
    ...fonts.semiBold
  },
  summary: {
    fontSize: 12,
    ...fonts.semiBold
  },
  exportAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    minHeight: 48
  },
  exportAllLabel: {
    fontSize: 11,
    ...fonts.semiBold
  },
  exportRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12
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
  list: {
    paddingHorizontal: 12,
    paddingBottom: 16
  },
  tripCard: {
    marginBottom: 8
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
