/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { View, Text, FlatList, Pressable, StyleSheet, BackHandler } from "react-native"
import { Check, Merge, Share, X } from "lucide-react-native"
import { radius } from "@colota/shared"
import { Button } from "../../ui/Button"
import { Divider } from "../../ui/Divider"
import { EmptyState } from "../../ui/EmptyState"
import { SectionTitle } from "../../ui/SectionTitle"
import { text } from "../../../styles/typography"
import { useTranslation } from "../../../i18n/useTranslation"
import { formatDistance, formatDuration, formatShortDistance, formatSpeed, formatTime } from "../../../utils/geo"
import type { Trip, ThemeColors } from "../../../types/global"
import { getTripColor, computeTripStats, type TripStats } from "../../../utils/trips"
import { EXPORT_FORMATS, EXPORT_FORMAT_KEYS, type ExportFormat } from "../../../utils/exportConverters"
import { showChoice } from "../../../services/modalService"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"

const DOT_SIZE = 8
const SEPARATOR = " · "

type Translate = (key: string, options?: Record<string, unknown>) => string

interface TripListProps {
  trips: Trip[]
  colors: ThemeColors
  onTripSelect: (trip: Trip) => void
  selectedTripIndex?: number | null
  onExport?: (format: ExportFormat, trips: Trip[]) => void
  onDelete?: (trips: Trip[]) => Promise<void>
  onMerge?: (trips: Trip[]) => Promise<void>
  /** The empty state's ghost action. Acts on the screen this list sits in, not on the day. */
  onShowOnMap?: () => void
}

interface TripRowProps {
  trip: Trip
  colors: ThemeColors
  stats: TripStats | undefined
  t: Translate
  selectionMode: boolean
  isCabSelected: boolean
  isMapSelected: boolean
  onPress: (trip: Trip) => void
  onLongPress: (trip: Trip) => void
}

/**
 * Selection is a tonal fill plus a check, never a coloured title: all six trip inks fail AA
 * as text on both grounds, so the ink stays put and the row's container carries the state.
 */
const TripRow = React.memo(function TripRow({
  trip,
  colors,
  stats,
  t,
  selectionMode,
  isCabSelected,
  isMapSelected,
  onPress,
  onLongPress
}: TripRowProps) {
  const duration = trip.endTime - trip.startTime
  const distance = formatDistance(trip.distance)
  const selected = isCabSelected || isMapSelected

  const detail = [
    distance,
    formatDuration(duration),
    stats && stats.avgSpeed > 0 ? formatSpeed(stats.avgSpeed) : null,
    stats && stats.elevationGain > 0
      ? t("history.trips.row.gain", { value: formatShortDistance(stats.elevationGain) })
      : null,
    stats && stats.elevationLoss > 0
      ? t("history.trips.row.loss", { value: formatShortDistance(stats.elevationLoss) })
      : null
  ]
    .filter(Boolean)
    .join(SEPARATOR)

  const label = t(selectionMode ? "history.trips.row.a11y" : "history.trips.row.a11yOpen", {
    index: trip.index,
    distance,
    duration: formatDuration(duration)
  })

  return (
    <Pressable
      testID={`trip-row-${trip.index}`}
      onPress={() => onPress(trip)}
      onLongPress={() => onLongPress(trip)}
      accessibilityRole={selectionMode ? "checkbox" : "button"}
      accessibilityState={selectionMode ? { checked: isCabSelected } : { selected: isMapSelected }}
      accessibilityLabel={label}
      accessibilityHint={selectionMode ? undefined : t("history.trips.row.hint")}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      style={[styles.row, selected && { backgroundColor: colors.primaryContainer }]}
    >
      <View style={styles.rowContent} importantForAccessibility="no">
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: getTripColor(trip.index) }]} />
          <Text style={[styles.title, { color: colors.text }]}>{t("history.trips.row", { index: trip.index })}</Text>
        </View>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
      </View>
      <Text style={[styles.time, { color: colors.textSecondary }]} importantForAccessibility="no">
        {formatTime(trip.startTime)}
      </Text>
      {isCabSelected ? (
        <View style={styles.check} importantForAccessibility="no">
          <Check size={size.icon.md} color={colors.text} />
        </View>
      ) : null}
    </Pressable>
  )
})

export function TripList({
  trips,
  colors,
  onTripSelect,
  selectedTripIndex,
  onExport,
  onDelete,
  onMerge,
  onShowOnMap
}: TripListProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selectionArmed, setSelectionArmed] = useState(false)
  const selectionMode = selectionArmed || selected.size > 0

  useEffect(() => {
    setSelected(new Set())
    setSelectionArmed(false)
  }, [trips])

  useEffect(() => {
    if (!selectionMode) return
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelected(new Set())
      setSelectionArmed(false)
      return true
    })
    return () => sub.remove()
  }, [selectionMode])

  const selectedTrips = useMemo(() => trips.filter((t2) => selected.has(t2.index)), [trips, selected])
  const allSelected = selected.size === trips.length && trips.length > 0
  // Merging a non-contiguous set would silently swallow the trips in between
  const isAdjacentSelection = useMemo(() => {
    if (selectedTrips.length < 2) return false
    for (let i = 1; i < selectedTrips.length; i++) {
      if (selectedTrips[i].index !== selectedTrips[i - 1].index + 1) return false
    }
    return true
  }, [selectedTrips])

  const totalDistance = trips.reduce((sum, trip) => sum + trip.distance, 0)

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
    setSelectionArmed(true)
    setSelected((prev) => {
      const next = new Set(prev)
      next.add(trip.index)
      return next
    })
  }, [])

  const handleEnterSelection = useCallback(() => setSelectionArmed(true), [])

  const handleSelectAllToggle = useCallback(() => {
    setSelected((prev) => (prev.size === trips.length ? new Set() : new Set(trips.map((trip) => trip.index))))
  }, [trips])

  const handleCancelSelection = useCallback(() => {
    setSelected(new Set())
    setSelectionArmed(false)
  }, [])

  const exportingRef = useRef(false)
  const askForFormat = useCallback(
    async (toExport: Trip[]) => {
      if (!onExport || toExport.length === 0 || exportingRef.current) return
      exportingRef.current = true
      try {
        const chosen = await showChoice({
          title: t("history.trips.export.title"),
          message: t("history.trips.export.message"),
          variant: "info",
          buttons: [
            ...EXPORT_FORMAT_KEYS.map((fmt) => ({ text: EXPORT_FORMATS[fmt].label, style: "secondary" as const })),
            { text: t("history.trips.export.cancel"), style: "secondary" as const }
          ]
        })
        if (chosen < 0 || chosen >= EXPORT_FORMAT_KEYS.length) return
        onExport(EXPORT_FORMAT_KEYS[chosen], toExport)
        setSelected(new Set())
        setSelectionArmed(false)
      } finally {
        exportingRef.current = false
      }
    },
    [onExport, t]
  )

  const deletingRef = useRef(false)
  const handleDeleteSelected = useCallback(async () => {
    if (!onDelete || selectedTrips.length === 0 || deletingRef.current) return
    deletingRef.current = true
    try {
      await onDelete(selectedTrips)
      setSelected(new Set())
      setSelectionArmed(false)
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
      setSelectionArmed(false)
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
        t={t}
        selectionMode={selectionMode}
        isCabSelected={selected.has(item.index)}
        isMapSelected={!selectionMode && selectedTripIndex === item.index}
        onPress={handleRowPress}
        onLongPress={handleRowLongPress}
      />
    ),
    [colors, statsCache, t, selectionMode, selected, selectedTripIndex, handleRowPress, handleRowLongPress]
  )

  if (trips.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState
          testID="trips-empty"
          title={t("history.trips.empty")}
          message={t("history.trips.empty.message")}
          actionLabel={onShowOnMap ? t("history.trips.empty.action") : undefined}
          onActionPress={onShowOnMap}
        />
      </View>
    )
  }

  const bulkAvailable = Boolean(onDelete || onMerge || onExport)

  return (
    <View style={styles.container}>
      {selectionMode ? (
        <View style={[styles.cab, { backgroundColor: colors.primaryContainer }]}>
          <Pressable
            onPress={handleCancelSelection}
            accessibilityRole="button"
            accessibilityLabel={t("history.trips.cancelSelection")}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.lg }}
            style={styles.iconBtn}
          >
            <X size={size.icon.md} color={colors.text} />
          </Pressable>
          <Text style={[styles.cabCount, { color: colors.text }]}>
            {t("history.trips.selected", { count: selected.size })}
          </Text>
          <Pressable
            onPress={handleSelectAllToggle}
            accessibilityRole="button"
            accessibilityLabel={allSelected ? t("history.trips.clearSelection") : t("history.trips.selectAll")}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
            style={styles.textBtn}
          >
            <Text style={[styles.textBtnLabel, { color: colors.text }]}>
              {allSelected ? t("history.trips.clear") : t("history.trips.all")}
            </Text>
          </Pressable>
          {onExport && (
            <Pressable
              onPress={() => askForFormat(selectedTrips)}
              accessibilityRole="button"
              accessibilityLabel={t("history.trips.exportSelected")}
              android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.lg }}
              style={styles.iconBtn}
            >
              <Share size={size.icon.md} color={colors.text} />
            </Pressable>
          )}
          {onMerge && trips.length >= 2 && (
            <Pressable
              onPress={handleMergeSelected}
              disabled={!isAdjacentSelection}
              accessibilityRole="button"
              accessibilityLabel={t("history.trips.mergeSelected")}
              accessibilityHint={isAdjacentSelection ? undefined : t("history.trips.mergeHint")}
              accessibilityState={{ disabled: !isAdjacentSelection }}
              android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.lg }}
              style={styles.iconBtn}
            >
              <Merge size={size.icon.md} color={isAdjacentSelection ? colors.text : colors.textDisabled} />
            </Pressable>
          )}
          {onDelete && (
            <Button
              variant="dangerGhost"
              title={t("history.trips.delete")}
              onPress={handleDeleteSelected}
              accessibilityLabel={t("history.trips.deleteSelected")}
            />
          )}
        </View>
      ) : (
        <View style={styles.header}>
          <SectionTitle
            first
            action={onExport ? { label: t("history.trips.exportAll"), onPress: () => askForFormat(trips) } : undefined}
          >
            {t("history.trips.summary", { count: trips.length, distance: formatDistance(totalDistance) })}
          </SectionTitle>
          {bulkAvailable && (
            <Button
              testID="select-trips-btn"
              variant="ghost"
              align="start"
              title={t("history.trips.select")}
              onPress={handleEnterSelection}
            />
          )}
        </View>
      )}
      <Divider tight />
      <FlatList
        data={trips}
        renderItem={renderTrip}
        keyExtractor={(item) => `trip-${item.index}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={ListSeparator}
        extraData={selected}
      />
    </View>
  )
}

const ListSeparator = () => <Divider tight />

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm
  },
  cab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    gap: space.xs
  },
  cabCount: {
    ...text.bodyStrong,
    flex: 1,
    paddingHorizontal: space.sm
  },
  iconBtn: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  textBtn: {
    minHeight: size.touch,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center"
  },
  textBtnLabel: {
    ...text.bodyStrong
  },
  list: {
    paddingBottom: space.xxl
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.row,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md
  },
  rowContent: {
    flex: 1
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.pill
  },
  title: {
    ...text.bodyStrong
  },
  detail: {
    ...text.label
  },
  time: {
    ...text.figureInline
  },
  check: {
    alignItems: "center",
    justifyContent: "center"
  },
  empty: {
    paddingHorizontal: space.lg
  }
})
