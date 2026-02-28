/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useMemo } from "react"
import { View, Text, FlatList, ScrollView, StyleSheet } from "react-native"
import { fonts } from "../../../styles/typography"
import { LocationCoords, ThemeColors } from "../../../types/global"
import { formatTime, getSpeedUnit } from "../../../utils/geo"

interface Props {
  locations: LocationCoords[]
  colors: ThemeColors
}

interface TableRow extends LocationCoords {
  delta: number | null
}

const ROW_HEIGHT = 36
const TABLE_WIDTH = 730

function val(v?: number | null, decimals = 0): string {
  if (v == null) return "-"
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))
}

const BATTERY_STATUS: Record<number, string> = {
  1: "Unknown",
  2: "Charging",
  3: "Discharging",
  4: "Not charging",
  5: "Full"
}

const LocationRow = React.memo(
  ({
    item,
    speedUnit,
    colors
  }: {
    item: TableRow
    speedUnit: { factor: number; unit: string }
    colors: ThemeColors
  }) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.cell, styles.cellTime, { color: colors.text }]} numberOfLines={1}>
        {item.timestamp ? formatTime(item.timestamp, true) : "-"}
      </Text>
      <Text style={[styles.cell, styles.cellNum, { color: colors.textSecondary }]} numberOfLines={1}>
        {item.delta != null ? `+${item.delta}s` : ""}
      </Text>
      <Text style={[styles.cell, styles.cellCoord, { color: colors.text }]} numberOfLines={1}>
        {val(item.latitude, 5)}
      </Text>
      <Text style={[styles.cell, styles.cellCoord, { color: colors.text }]} numberOfLines={1}>
        {val(item.longitude, 5)}
      </Text>
      <Text style={[styles.cell, styles.cellNum, { color: colors.text }]} numberOfLines={1}>
        {val(item.accuracy)}
      </Text>
      <Text style={[styles.cell, styles.cellNum, { color: colors.text }]} numberOfLines={1}>
        {item.speed != null ? (item.speed * speedUnit.factor).toFixed(1) : "-"}
      </Text>
      <Text style={[styles.cell, styles.cellNum, { color: colors.text }]} numberOfLines={1}>
        {val(item.altitude)}
      </Text>
      <Text style={[styles.cell, styles.cellNum, { color: colors.text }]} numberOfLines={1}>
        {item.bearing != null ? val(item.bearing, 1) : "-"}
      </Text>
      <Text style={[styles.cell, styles.cellNum, { color: colors.text }]} numberOfLines={1}>
        {item.battery != null ? `${item.battery}%` : "-"}
      </Text>
      <Text style={[styles.cell, styles.cellStatus, { color: colors.text }]} numberOfLines={1}>
        {item.battery_status != null ? (BATTERY_STATUS[item.battery_status] ?? String(item.battery_status)) : "-"}
      </Text>
    </View>
  )
)

const keyExtractor = (_: TableRow, index: number) => String(index)
const getItemLayout = (_: any, index: number) => ({
  length: ROW_HEIGHT,
  offset: ROW_HEIGHT * index,
  index
})

export function LocationTable({ locations, colors }: Props) {
  const speedUnit = useMemo(() => getSpeedUnit(), [])

  const data = useMemo<TableRow[]>(() => {
    // Compute deltas in chronological order, then reverse for newest-first display
    const rows = locations.map((loc, i) => ({
      ...loc,
      delta:
        i > 0 && loc.timestamp && locations[i - 1].timestamp
          ? Math.round(loc.timestamp - locations[i - 1].timestamp!)
          : null
    }))
    return rows.reverse()
  }, [locations])

  const renderItem = useCallback(
    ({ item }: { item: TableRow }) => <LocationRow item={item} speedUnit={speedUnit} colors={colors} />,
    [colors, speedUnit]
  )

  if (locations.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No data for this day</Text>
      </View>
    )
  }

  return (
    <ScrollView horizontal style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.tableWrapper}>
        {/* Header */}
        <View
          style={[styles.row, styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Text style={[styles.cell, styles.cellTime, styles.headerText, { color: colors.textSecondary }]}>Time</Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>Δs</Text>
          <Text style={[styles.cell, styles.cellCoord, styles.headerText, { color: colors.textSecondary }]}>Lat</Text>
          <Text style={[styles.cell, styles.cellCoord, styles.headerText, { color: colors.textSecondary }]}>Lon</Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>Acc</Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>
            {speedUnit.unit}
          </Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>Alt</Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>Bear</Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>Batt</Text>
          <Text style={[styles.cell, styles.cellStatus, styles.headerText, { color: colors.textSecondary }]}>
            Status
          </Text>
        </View>

        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          extraData={locations}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
          windowSize={11}
        />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32
  },
  emptyText: {
    fontSize: 14,
    ...fonts.regular
  },
  header: {
    borderBottomWidth: 2
  },
  headerText: {
    fontSize: 11,
    ...fonts.bold,
    textTransform: "uppercase"
  },
  row: {
    flexDirection: "row",
    height: ROW_HEIGHT,
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  cell: {
    fontSize: 12,
    ...fonts.regular,
    paddingHorizontal: 2
  },
  cellTime: {
    width: 80
  },
  cellCoord: {
    width: 90
  },
  cellNum: {
    width: 50
  },
  cellStatus: {
    width: 90
  },
  tableWrapper: {
    width: TABLE_WIDTH,
    flex: 1
  }
})
