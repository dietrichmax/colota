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
import { BatteryCharging, BatteryFull } from "lucide-react-native"
import { fontSizes, fonts, lineHeights, type } from "../../../styles/typography"
import { LocationCoords, ThemeColors } from "../../../types/global"
import { formatTime, getSpeedUnit, getTimeFormat } from "../../../utils/geo"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { Divider } from "../../ui/Divider"

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
  delta: 56,
  lat: 88,
  lon: 88,
  acc: 56,
  speed: 72,
  alt: 56,
  bear: 56,
  batt: 80,
  sync: 72,
  note: 176
}

// "10:17:10 PM" is three characters wider than "22:17:10".
const TIME_WIDTH = { "24h": 88, "12h": 112 } as const
const ROW_LENGTH = size.touch + StyleSheet.hairlineWidth
const BATTERY_CHARGING = 2
const BATTERY_FULL = 3

function val(v?: number | null, decimals = 0): string {
  if (v == null) return "-"
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))
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
    accessibilityLabel={`${timeOf(item)}, show on map`}
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
    const BatteryGlyph =
      item.battery_status === BATTERY_CHARGING
        ? BatteryCharging
        : item.battery_status === BATTERY_FULL
          ? BatteryFull
          : null
    const batteryWord =
      item.battery_status === BATTERY_CHARGING ? "charging" : item.battery_status === BATTERY_FULL ? "full" : null
    const battery = item.battery != null ? `${item.battery}%` : "-"
    const syncWord = item.sent ? "Sent" : "Queued"
    const facts = [
      timeOf(item),
      item.delta != null ? `${item.delta} seconds after the previous point` : null,
      `${val(item.latitude, 5)}, ${val(item.longitude, 5)}`,
      `accuracy ${val(item.accuracy)} m`,
      item.speed != null ? `speed ${(item.speed * speedUnit.factor).toFixed(1)} ${speedUnit.unit}` : null,
      item.altitude != null ? `altitude ${val(item.altitude)} m` : null,
      item.bearing != null ? `bearing ${val(item.bearing)}` : null,
      item.battery != null ? `battery ${battery}${batteryWord ? ` ${batteryWord}` : ""}` : null,
      hasEndpoint ? syncWord : null,
      item.note ? `note ${item.note}` : null,
      "show on map"
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
          {item.delta != null ? `+${item.delta}` : ""}
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
          {item.speed != null ? (item.speed * speedUnit.factor).toFixed(1) : "-"}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.alt }]} numberOfLines={1}>
          {val(item.altitude)}
        </Text>
        <Text style={[mono, { width: COLUMN_WIDTHS.bear }]} numberOfLines={1}>
          {val(item.bearing)}
        </Text>
        <View
          style={[styles.batteryCell, { width: COLUMN_WIDTHS.batt }]}
          accessibilityRole="text"
          accessibilityLabel={batteryWord ? `${battery} ${batteryWord}` : battery}
        >
          <Text style={[styles.mono, { color: content }]} numberOfLines={1}>
            {battery}
          </Text>
          {BatteryGlyph && <BatteryGlyph size={size.icon.sm} color={colors.textSecondary} />}
        </View>
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
            Time
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
              Δs
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.lat }]} numberOfLines={2}>
              Lat
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.lon }]} numberOfLines={2}>
              Lon
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.acc }]} numberOfLines={2}>
              Acc m
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.speed }]} numberOfLines={2}>
              {`Speed ${speedUnit.unit}`}
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.alt }]} numberOfLines={2}>
              Alt m
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.bear }]} numberOfLines={2}>
              Bear
            </Text>
            <Text style={[numericHeader, { width: COLUMN_WIDTHS.batt }]} numberOfLines={2}>
              Batt %
            </Text>
            {hasEndpoint && (
              <Text style={[header, { width: COLUMN_WIDTHS.sync }]} numberOfLines={2}>
                Sync
              </Text>
            )}
            <Text style={[header, { width: COLUMN_WIDTHS.note }]} numberOfLines={2}>
              Note
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
  },
  batteryCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.xs,
    paddingEnd: space.md
  }
})
