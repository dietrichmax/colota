/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Check } from "lucide-react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../../hooks/useTheme"
import { fontSizes, fonts, lineHeights } from "../../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { formatDistance, formatDuration, formatSpeed, formatTime, spokenDistance } from "../../../utils/geo"
import { computeTripStats, getTripColor } from "../../../utils/trips"
import type { Trip } from "../../../types/global"

type TripRowProps = {
  trip: Trip
  index: number
  selected: boolean
  selecting: boolean
  onPress: () => void
  onLongPress: () => void
  testID?: string
}

function spokenDuration(seconds: number): string {
  const s = Math.max(0, seconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
  parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`)
  return parts.join(" ")
}

/** The trip's colour as an 8 dp dot, the same mark the map draws the trip in. */
export function TripSwatch({ index }: { index: number }) {
  return <View style={[styles.swatch, { backgroundColor: getTripColor(index) }]} />
}

export function TripRow({ trip, index, selected, selecting, onPress, onLongPress, testID }: TripRowProps) {
  const { colors } = useTheme()
  const duration = trip.endTime - trip.startTime
  const avgSpeed = useMemo(() => computeTripStats(trip.locations).avgSpeed, [trip.locations])
  const start = formatTime(trip.startTime)
  const end = formatTime(trip.endTime)
  const detail = [formatDistance(trip.distance), formatDuration(duration), avgSpeed > 0 ? formatSpeed(avgSpeed) : null]
    .filter(Boolean)
    .join(" · ")

  const content = selected ? colors.onPrimaryContainer : colors.text
  const subContent = selected ? colors.onPrimaryContainer : colors.textSecondary

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Trip ${index}, ${start} to ${end}, ${spokenDistance(trip.distance)}, ${spokenDuration(duration)}`}
      accessibilityHint={selecting ? undefined : "Opens trip details"}
      accessibilityState={{ selected }}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, selected && { backgroundColor: colors.primaryContainer }]}
    >
      <View style={styles.glyph}>
        {selected ? <Check size={size.icon.md} color={content} /> : <TripSwatch index={index} />}
      </View>
      <View style={styles.column}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: content }]}>Trip {index}</Text>
          <Text style={[styles.time, { color: subContent }]}>
            {start} - {end}
          </Text>
        </View>
        <Text style={[styles.detail, { color: subContent }]}>{detail}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    minHeight: size.row,
    paddingVertical: space.md,
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg
  },
  glyph: {
    width: size.icon.md,
    alignItems: "center"
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: radius.pill
  },
  column: {
    flex: 1
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: space.sm
  },
  title: {
    flexGrow: 1,
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  time: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    ...fonts.regular,
    fontVariant: ["tabular-nums"]
  },
  detail: {
    fontSize: fontSizes.description,
    lineHeight: lineHeights.description,
    ...fonts.regular,
    marginTop: space.xxs
  }
})
