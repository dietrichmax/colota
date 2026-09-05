/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useMemo } from "react"
import { View, Text, FlatList, ScrollView, StyleSheet } from "react-native"
import { text } from "../../../styles/typography"
import { EmptyState } from "../../ui/EmptyState"
import { Divider } from "../../ui/Divider"
import { useTranslation } from "../../../i18n/useTranslation"
import { LocationCoords, ThemeColors } from "../../../types/global"
import { formatTime, getSpeedUnit } from "../../../utils/geo"
import { space } from "../../../constants"

interface Props {
  locations: LocationCoords[]
  colors: ThemeColors
}

interface TableRow extends LocationCoords {
  delta: number | null
}

const ROW_HEIGHT = 36
const TABLE_WIDTH = 870
const CELL_GUTTER = 2
// The hairline between rows counts towards the scroll offset, or getItemLayout drifts.
const ROW_STRIDE = ROW_HEIGHT + StyleSheet.hairlineWidth

function val(v?: number | null, decimals = 0): string {
  if (v == null) return "-"
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))
}

// Mirrors BatteryStatus.kt.
const BATTERY_STATUS_KEYS: Record<number, string> = {
  0: "history.table.status.unknown",
  1: "history.table.status.discharging",
  2: "history.table.status.charging",
  3: "history.table.status.full"
}

const LocationRow = React.memo(
  ({
    item,
    speedUnit,
    colors,
    batteryStatus
  }: {
    item: TableRow
    speedUnit: { factor: number; unit: string }
    colors: ThemeColors
    batteryStatus: (status: number | null | undefined) => string
  }) => (
    <View style={styles.row}>
      <Text style={[styles.cell, styles.cellTime, { color: colors.text }]} numberOfLines={1}>
        {item.timestamp ? formatTime(item.timestamp, true) : "-"}
      </Text>
      <Text style={[styles.cell, styles.cellNum, { color: colors.textSecondary }]} numberOfLines={1}>
        {item.delta != null ? `+${item.delta}` : ""}
      </Text>
      <Text style={[styles.coordCell, styles.cellCoord, { color: colors.text }]} numberOfLines={1}>
        {val(item.latitude, 5)}
      </Text>
      <Text style={[styles.coordCell, styles.cellCoord, { color: colors.text }]} numberOfLines={1}>
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
        {batteryStatus(item.battery_status)}
      </Text>
      <Text style={[styles.cell, styles.cellNote, { color: colors.text }]} numberOfLines={1}>
        {item.note ? item.note : "-"}
      </Text>
    </View>
  )
)

const keyExtractor = (_: TableRow, index: number) => String(index)
const getItemLayout = (_: any, index: number) => ({
  length: ROW_STRIDE,
  offset: ROW_STRIDE * index,
  index
})

const RowSeparator = () => <Divider tight />

export function LocationTable({ locations, colors }: Props) {
  const { t } = useTranslation()
  const speedUnit = useMemo(() => getSpeedUnit(), [])

  const batteryStatus = useCallback(
    (status: number | null | undefined) => {
      if (status == null) return "-"
      const key = BATTERY_STATUS_KEYS[status]
      return key ? t(key) : String(status)
    },
    [t]
  )

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
    ({ item }: { item: TableRow }) => (
      <LocationRow item={item} speedUnit={speedUnit} colors={colors} batteryStatus={batteryStatus} />
    ),
    [colors, speedUnit, batteryStatus]
  )

  if (locations.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState testID="table-empty" title={t("history.table.empty")} />
      </View>
    )
  }

  return (
    <ScrollView horizontal style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.tableWrapper}>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.cellTime, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.time")}
          </Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.delta")}
          </Text>
          <Text style={[styles.cell, styles.cellCoord, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.latitude")}
          </Text>
          <Text style={[styles.cell, styles.cellCoord, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.longitude")}
          </Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.accuracy")}
          </Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>
            {speedUnit.unit}
          </Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.altitude")}
          </Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.bearing")}
          </Text>
          <Text style={[styles.cell, styles.cellNum, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.battery")}
          </Text>
          <Text style={[styles.cell, styles.cellStatus, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.charge")}
          </Text>
          <Text style={[styles.cell, styles.cellNote, styles.headerText, { color: colors.textSecondary }]}>
            {t("history.table.note")}
          </Text>
        </View>
        <Divider tight testID="table-header-rule" />

        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          ItemSeparatorComponent={RowSeparator}
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
    paddingHorizontal: space.lg
  },
  headerText: {
    ...text.caption
  },
  row: {
    flexDirection: "row",
    height: ROW_HEIGHT,
    alignItems: "center",
    paddingHorizontal: space.sm
  },
  cell: {
    ...text.caption,
    paddingHorizontal: CELL_GUTTER
  },
  coordCell: {
    ...text.coord,
    paddingHorizontal: CELL_GUTTER
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
  cellNote: {
    width: 140
  },
  tableWrapper: {
    width: TABLE_WIDTH,
    flex: 1
  }
})
