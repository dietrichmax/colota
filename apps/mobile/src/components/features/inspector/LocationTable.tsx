/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useMemo, useRef } from "react"
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent
} from "react-native"
import { fontSizes, fonts, lineHeights, type } from "../../../styles/typography"
import { LocationCoords, ThemeColors } from "../../../types/global"
import { formatTime, getSpeedUnit, getTimeFormat } from "../../../utils/geo"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { Divider } from "../../ui/Divider"
import { t } from "../../../i18n/t"
import { formatDecimal } from "../../../utils/format"

interface Props {
  locations: LocationCoords[]
  colors: ThemeColors
  hasEndpoint: boolean
  selectedPointId?: number
  onSelectPoint: (id: number) => void
}

interface TableRow extends LocationCoords {
  delta: number | null
}

const COLUMN_WIDTHS = {
  delta: 88,
  lat: 88,
  lon: 88,
  acc: 56,
  speed: 72,
  alt: 56,
  bear: 56,
  batt: 56,
  power: 96,
  sync: 72,
  note: 176
}

// "10:17:10 PM" is three characters wider than "22:17:10".
const TIME_WIDTH = { "24h": 88, "12h": 112 } as const
const ROW_LENGTH = size.touch + StyleSheet.hairlineWidth
const isPowerStatus = (status: number): status is 1 | 2 | 3 => status >= 1 && status <= 3

function val(v?: number | null, decimals = 0): string {
  if (v == null) return "-"
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))
}

function gap(seconds: number): string {
  const [d, h, m, s] = [t("unit.compact.d"), t("unit.compact.h"), t("unit.compact.min"), t("unit.compact.s")]
  if (seconds < 60) return `${seconds}${s}`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${m} ${seconds % 60}${s}`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}${h} ${Math.floor((seconds % 3600) / 60)}${m}`
  return `${Math.floor(seconds / 86400)}${d} ${Math.floor((seconds % 86400) / 3600)}${h}`
}

function timeOf(item: TableRow): string {
  return item.timestamp ? formatTime(item.timestamp, true) : "-"
}

type RowProps = {
  item: TableRow
  colors: ThemeColors
  selected: boolean
  onSelectPoint: (id: number) => void
}

const TimeCell = React.memo(({ item, colors, selected, onSelectPoint }: RowProps) => (
  <Pressable
    style={[styles.row, selected && { backgroundColor: colors.primaryContainer }]}
    android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
    accessibilityRole="button"
    accessibilityLabel={t("table.timeShowOnMap", { time: timeOf(item) })}
    accessibilityState={{ selected }}
    onPress={() => item.id != null && onSelectPoint(item.id)}
  >
    <Text
      style={[
        styles.mono,
        { width: TIME_WIDTH[getTimeFormat()], color: colors.text },
        selected && [styles.selectedTime, { color: colors.onPrimaryContainer }]
      ]}
      numberOfLines={1}
    >
      {timeOf(item)}
    </Text>
  </Pressable>
))

const DataRow = React.memo(
  ({
    item,
    colors,
    selected,
    onSelectPoint,
    speedUnit,
    hasEndpoint
  }: RowProps & { speedUnit: { factor: number; unit: string }; hasEndpoint: boolean }) => {
    const status = item.battery_status ?? 0
    const powerKey = isPowerStatus(status) ? status : undefined
    const power = powerKey ? t(`table.power.${powerKey}`) : undefined
    const battery = item.battery != null ? `${item.battery}%` : "-"
    const syncWord = item.sent ? t("point.sent") : t("point.queued")
    const facts = [
      timeOf(item),
      item.delta != null ? t("table.fact.delta", { count: item.delta, n: item.delta }) : null,
      `${val(item.latitude, 5)}, ${val(item.longitude, 5)}`,
      t("table.fact.accuracy", { value: val(item.accuracy) }),
      item.speed != null
        ? t("table.fact.speed", { value: formatDecimal(item.speed * speedUnit.factor, 1), unit: speedUnit.unit })
        : null,
      item.altitude != null ? t("table.fact.altitude", { value: val(item.altitude) }) : null,
      item.bearing != null ? t("table.fact.bearing", { value: val(item.bearing) }) : null,
      item.battery != null
        ? powerKey
          ? t("table.fact.batteryPower", { level: battery, power: t(`table.power.${powerKey}.clause`) })
          : t("table.fact.battery", { level: battery })
        : null,
      hasEndpoint ? syncWord : null,
      item.note ? t("table.fact.note", { note: item.note }) : null,
      t("table.showOnMap")
    ].filter(Boolean)
    const content = selected ? colors.onPrimaryContainer : colors.text
    const mono = [styles.mono, styles.numeric, { color: content }]
    return (
      <Pressable
        style={[styles.row, selected && { backgroundColor: colors.primaryContainer }]}
        android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
        accessibilityRole="button"
        accessibilityLabel={facts.join(", ")}
        accessibilityState={{ selected }}
        onPress={() => item.id != null && onSelectPoint(item.id)}
      >
        <Text style={[mono, { width: COLUMN_WIDTHS.delta }]} numberOfLines={1}>
          {item.delta != null ? gap(item.delta) : ""}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.lat }]} numberOfLines={1}>
          {val(item.latitude, 5)}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.lon }]} numberOfLines={1}>
          {val(item.longitude, 5)}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.acc }]} numberOfLines={1}>
          {val(item.accuracy)}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.speed }]} numberOfLines={1}>
          {item.speed != null ? formatDecimal(item.speed * speedUnit.factor, 1) : "-"}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.alt }]} numberOfLines={1}>
          {val(item.altitude)}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.bear }]} numberOfLines={1}>
          {val(item.bearing)}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.batt }]} numberOfLines={1}>
          {battery}
        </Text>
        <Text style={[styles.caption, { width: COLUMN_WIDTHS.power, color: content }]} numberOfLines={1}>
          {power ?? "-"}
        </Text>
        {hasEndpoint && (
          <Text style={[styles.caption, { width: COLUMN_WIDTHS.sync, color: content }]} numberOfLines={1}>
            {syncWord}
          </Text>
        )}
        <Text style={[styles.caption, { width: COLUMN_WIDTHS.note, color: content }]} numberOfLines={1}>
          {item.note ?? ""}
        </Text>
      </Pressable>
    )
  }
)

const Separator = () => <Divider tight />
const keyExtractor = (item: TableRow, index: number) => String(item.id ?? index)
const getItemLayout = (_: unknown, index: number) => ({ length: ROW_LENGTH, offset: ROW_LENGTH * index, index })

export function LocationTable({ locations, colors, hasEndpoint, selectedPointId, onSelectPoint }: Props) {
  const speedUnit = getSpeedUnit()
  const timeListRef = useRef<FlatList<TableRow>>(null)

  const data = useMemo<TableRow[]>(() => {
    const rows = locations.map((loc, i) => ({
      ...loc,
      delta:
        i > 0 && loc.timestamp && locations[i - 1].timestamp
          ? Math.round(loc.timestamp - locations[i - 1].timestamp!)
          : null
    }))
    return rows.reverse()
  }, [locations])

  // The time pane only follows: a second scroller echoing every frame cancels the fling of the first.
  const onDataScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    timeListRef.current?.scrollToOffset({ offset: e.nativeEvent.contentOffset.y, animated: false })
  }, [])

  const renderTime = useCallback(
    ({ item }: { item: TableRow }) => (
      <TimeCell item={item} colors={colors} selected={item.id === selectedPointId} onSelectPoint={onSelectPoint} />
    ),
    [colors, selectedPointId, onSelectPoint]
  )
  const renderData = useCallback(
    ({ item }: { item: TableRow }) => (
      <DataRow
        item={item}
        colors={colors}
        selected={item.id === selectedPointId}
        onSelectPoint={onSelectPoint}
        speedUnit={speedUnit}
        hasEndpoint={hasEndpoint}
      />
    ),
    [colors, selectedPointId, onSelectPoint, speedUnit, hasEndpoint]
  )

  const header = [styles.headerCell, { color: colors.textSecondary }]
  const numericHeader = [header, styles.numeric]
  const dataWidth =
    COLUMN_WIDTHS.delta +
    COLUMN_WIDTHS.lat +
    COLUMN_WIDTHS.lon +
    COLUMN_WIDTHS.acc +
    COLUMN_WIDTHS.speed +
    COLUMN_WIDTHS.alt +
    COLUMN_WIDTHS.bear +
    COLUMN_WIDTHS.batt +
    COLUMN_WIDTHS.power +
    (hasEndpoint ? COLUMN_WIDTHS.sync : 0) +
    COLUMN_WIDTHS.note

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={{ width: TIME_WIDTH[getTimeFormat()] }}
        importantForAccessibility="no-hide-descendants"
        testID="table-time-pane"
      >
        <View style={styles.headerRow}>
          <Text style={[header, { width: TIME_WIDTH[getTimeFormat()] }]} numberOfLines={2}>
            {t("table.col.time")}
          </Text>
        </View>
        <Divider tight />
        <FlatList
          ref={timeListRef}
          testID="table-time-list"
          data={data}
          renderItem={renderTime}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          ItemSeparatorComponent={Separator}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
          windowSize={11}
        />
      </View>
      <ScrollView horizontal style={styles.container} testID="table-data-pane">
        <View style={{ width: dataWidth }}>
          <View style={styles.headerRow}>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.delta }]} numberOfLines={2}>
              {t("table.col.since")}
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.lat }]} numberOfLines={2}>
              {t("table.col.lat")}
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.lon }]} numberOfLines={2}>
              {t("table.col.lon")}
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.acc }]} numberOfLines={2}>
              {t("table.col.acc")}
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.speed }]} numberOfLines={2}>
              {t("table.col.speed", { unit: speedUnit.unit })}
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.alt }]} numberOfLines={2}>
              {t("table.col.alt")}
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.bear }]} numberOfLines={2}>
              {t("table.col.bear")}
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.batt }]} numberOfLines={2}>
              {t("table.col.batt")}
            </Text>
            <Text style={[header, { width: COLUMN_WIDTHS.power }]} numberOfLines={2}>
              {t("table.col.power")}
            </Text>
            {hasEndpoint && (
              <Text style={[header, { width: COLUMN_WIDTHS.sync }]} numberOfLines={2}>
                {t("table.col.sync")}
              </Text>
            )}
            <Text style={[header, { width: COLUMN_WIDTHS.note }]} numberOfLines={2}>
              {t("table.col.note")}
            </Text>
          </View>
          <Divider tight />
          <FlatList
            testID="table-data-list"
            data={data}
            renderItem={renderData}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            ItemSeparatorComponent={Separator}
            onScroll={onDataScroll}
            scrollEventThrottle={16}
            initialNumToRender={30}
            maxToRenderPerBatch={20}
            windowSize={11}
          />
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row"
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    height: size.touch
  },
  headerCell: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    ...fonts.semiBold,
    paddingHorizontal: space.md
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: size.touch
  },
  mono: {
    ...type.mono,
    paddingHorizontal: space.md
  },
  numeric: {
    textAlign: "right"
  },
  // The platform monospace has no weight token, and its fake bold keeps the advances, so no jitter.
  selectedTime: {
    fontWeight: "bold"
  },
  caption: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    ...fonts.regular,
    paddingHorizontal: space.md
  }
})
