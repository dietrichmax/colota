/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { View, Text, FlatList, Pressable, StyleSheet, BackHandler } from "react-native"
import { Check, Route, Share, Trash2, X, Merge } from "lucide-react-native"
import { Card } from "../../ui/Card"
import { EmptyState } from "../../ui/EmptyState"
import { IconButton } from "../../ui/IconButton"
import { fontSizes, fonts } from "../../../styles/typography"
import { formatDistance, formatDuration, formatSpeed, formatTime } from "../../../utils/geo"
import type { Trip, ThemeColors } from "../../../types/global"
import { getTripColor, computeTripStats, type TripStats } from "../../../utils/trips"
import { EXPORT_FORMATS, EXPORT_FORMAT_KEYS, type ExportFormat } from "../../../utils/exportConverters"
import { HIT_SLOP_MD, HIT_SLOP_SM, size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { radius } from "@colota/shared"

interface TripListProps {
  trips: Trip[]
  colors: ThemeColors
  onTripSelect: (trip: Trip) => void
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
  onPress: (trip: Trip) => void
  onLongPress: (trip: Trip) => void
}

const TripRow = React.memo(function TripRowItem({
  trip,
  colors,
  stats,
  selectionMode,
  isCabSelected,
  onPress,
  onLongPress
}: TripRowProps) {
  const duration = trip.endTime - trip.startTime
  const tripColor = getTripColor(trip.index)
  const statLine = [
    formatDistance(trip.distance),
    formatDuration(duration),
    stats && stats.avgSpeed > 0 ? formatSpeed(stats.avgSpeed) : null,
    stats && stats.elevationGain > 0 ? `+${Math.round(stats.elevationGain)} m` : null,
    stats && stats.elevationLoss > 0 ? `-${Math.round(stats.elevationLoss)} m` : null
  ]
    .filter(Boolean)
    .join("  ·  ")
  // Selection is a fill, not a stroke: toggling borderWidth on a card that clips its own
  // corners leaves the children clipped away on Android until the list remounts.
  const cardStyle = isCabSelected && { backgroundColor: colors.primaryContainer }
  const content = isCabSelected ? colors.onPrimaryContainer : colors.text
  const subContent = isCabSelected ? colors.onPrimaryContainer : colors.textSecondary

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
          <View style={styles.tripLead}>
            {isCabSelected ? (
              <Check size={size.icon.sm} color={content} />
            ) : (
              <View style={[styles.tripDot, { backgroundColor: tripColor }]} />
            )}
          </View>
          <Text style={[styles.tripTitle, { color: content }]}>Trip {trip.index}</Text>
        </View>
        <Text style={[styles.tripTime, { color: content }]}>
          {formatTime(trip.startTime)} - {formatTime(trip.endTime)}
        </Text>
      </View>

      <Text style={[styles.tripStats, { color: subContent }]}>{statLine}</Text>
    </Card>
  )
})

export function TripList({ trips, colors, onTripSelect, onExport, onDelete, onMerge }: TripListProps) {
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
  // Merging a non-contiguous set would silently swallow the trips in between
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
        onPress={handleRowPress}
        onLongPress={handleRowLongPress}
      />
    ),
    [colors, statsCache, selectionMode, selected, handleRowPress, handleRowLongPress]
  )

  if (trips.length === 0) {
    return <EmptyState icon={Route} title="No trips for this day" hint="Need at least 2 points to form a trip" />
  }

  return (
    <View style={styles.container}>
      {selectionMode ? (
        <View style={[styles.headerRow, { backgroundColor: colors.well }]}>
          <View style={styles.cabLeft}>
            <IconButton icon={X} accessibilityLabel="Cancel selection" onPress={handleCancelSelection} />
            <Text style={[styles.cabSummary, { color: colors.text }]}>{selected.size} selected</Text>
          </View>
          <View style={styles.cabActions}>
            <Pressable
              onPress={handleSelectAllToggle}
              hitSlop={HIT_SLOP_SM}
              android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true }}
              style={styles.cabTextBtn}
              accessibilityRole="button"
              accessibilityLabel={allSelected ? "Clear selection" : "Select all trips"}
            >
              <Text style={[styles.cabTextBtnLabel, { color: allSelected ? colors.primary : colors.text }]}>
                {allSelected ? "Clear" : "All"}
              </Text>
            </Pressable>
            {onExport && (
              <IconButton
                icon={Share}
                tone={showExport ? "primary" : "neutral"}
                accessibilityLabel="Export selected trips"
                onPress={() => setShowExport((prev) => !prev)}
              />
            )}
            {onMerge && trips.length >= 2 && (
              <IconButton
                icon={Merge}
                disabled={!isAdjacentSelection}
                accessibilityLabel="Merge selected trips"
                onPress={handleMergeSelected}
              />
            )}
            {onDelete && (
              <IconButton
                icon={Trash2}
                tone="danger"
                accessibilityLabel="Delete selected trips"
                onPress={handleDeleteSelected}
              />
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
              android_ripple={{ color: colors.primaryDark + STATE_LAYER_ALPHA, borderless: true }}
              style={styles.exportAllBtn}
              accessibilityRole="button"
              accessibilityLabel="Export all trips"
              accessibilityState={{ expanded: showExport }}
            >
              <Share size={size.icon.sm} color={showExport ? colors.primary : colors.textSecondary} />
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
              hitSlop={HIT_SLOP_MD}
              android_ripple={{ color: colors.onPrimaryContainer + STATE_LAYER_ALPHA }}
              style={[styles.exportChip, { backgroundColor: colors.primaryContainer }]}
              accessibilityRole="button"
              accessibilityLabel={
                selectionMode
                  ? `Export ${selectedTrips.length} selected trips as ${EXPORT_FORMATS[fmt].label}`
                  : `Export all trips as ${EXPORT_FORMATS[fmt].label}`
              }
            >
              <Text style={[styles.exportChipText, { color: colors.onPrimaryContainer }]}>
                {EXPORT_FORMATS[fmt].label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <FlatList
        data={trips}
        renderItem={renderTrip}
        keyExtractor={(item) => `trip-${item.index}`}
        contentContainerStyle={[styles.list, trips.length === 0 && styles.listEmpty]}
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
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    minHeight: size.row
  },
  cabLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1
  },
  cabSummary: {
    fontSize: fontSizes.description,
    ...fonts.semiBold
  },
  cabActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs
  },
  cabTextBtn: {
    minHeight: size.touch,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center"
  },
  cabTextBtnLabel: {
    fontSize: fontSizes.description,
    ...fonts.semiBold
  },
  summary: {
    fontSize: fontSizes.caption,
    ...fonts.semiBold
  },
  exportAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    minHeight: size.touch
  },
  exportAllLabel: {
    fontSize: fontSizes.small,
    ...fonts.semiBold
  },
  exportRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md
  },
  exportChip: {
    minHeight: size.chip,
    justifyContent: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm
  },
  exportChipText: {
    fontSize: fontSizes.caption,
    ...fonts.medium
  },
  list: {
    paddingHorizontal: space.md,
    // gap spaces the rows against each other; the first one still needs clearing the header.
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: space.sm
  },
  // so an empty state has room to centre in
  listEmpty: { flexGrow: 1 },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.sm
  },
  tripTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  // Both leading marks sit in the same width, so the title does not shift when a row is picked.
  tripLead: {
    width: size.icon.sm,
    alignItems: "center"
  },
  tripDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill
  },
  tripTitle: {
    fontSize: fontSizes.input,
    ...fonts.medium
  },
  tripTime: {
    fontSize: fontSizes.input,
    ...fonts.medium,
    fontVariant: ["tabular-nums"]
  },
  tripStats: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    fontVariant: ["tabular-nums"]
  }
})
