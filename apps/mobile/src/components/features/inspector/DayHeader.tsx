/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { fontSizes, fonts, lineHeights } from "../../../styles/typography"
import { formatDistance } from "../../../utils/geo"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"

export type DayStats = {
  points: number
  trips: number
  distanceMeters: number
}

type DayHeaderProps = {
  date: Date
  stats: DayStats | null
  loading: boolean
  onPrevious: () => void
  onNext: () => void
  onOpenPicker: () => void
  nextDisabled: boolean
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function daysBefore(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
}

function withYear(date: Date, now: Date): { year?: "numeric" } {
  return date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }
}

export function isRelativeDay(date: Date, now: Date = new Date()): boolean {
  const days = daysBefore(date, now)
  return days === 0 || days === 1
}

export function dayTitle(date: Date, now: Date = new Date()): string {
  const days = daysBefore(date, now)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...withYear(date, now)
  })
}

export function dayLongDate(date: Date, now: Date = new Date()): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...withYear(date, now) })
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

export function dayLedger(stats: DayStats | null, loading: boolean): string {
  if (loading) return "Loading"
  if (!stats || stats.points === 0) return "No locations recorded"
  if (stats.trips === 0) return `${count(stats.points, "point")} · no trips`
  return `${count(stats.trips, "trip")} · ${formatDistance(stats.distanceMeters)} · ${count(stats.points, "point")}`
}

export function dayCaption(date: Date, stats: DayStats | null, loading: boolean, now: Date = new Date()): string {
  const ledger = dayLedger(stats, loading)
  if (!isRelativeDay(date, now)) return ledger
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${ledger}`
}

export function DayHeader({ date, stats, loading, onPrevious, onNext, onOpenPicker, nextDisabled }: DayHeaderProps) {
  const { colors } = useTheme()
  const now = new Date()
  const title = dayTitle(date, now)
  const caption = dayCaption(date, stats, loading, now)
  const ripple = { color: colors.text + STATE_LAYER_ALPHA }
  const chevronRipple = { ...ripple, borderless: true, radius: size.touch / 2 }

  return (
    <View style={[styles.row, { backgroundColor: colors.background }]} testID="day-header">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        onPress={onPrevious}
        android_ripple={chevronRipple}
        style={styles.chevron}
        testID="day-previous"
      >
        <ChevronLeft size={size.icon.md} color={colors.text} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change day, ${dayLongDate(date, now)}, ${dayLedger(stats, loading)}`}
        accessibilityHint="Opens the calendar"
        onPress={onOpenPicker}
        android_ripple={ripple}
        style={styles.centre}
        testID="day-title"
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <ChevronDown size={size.icon.sm} color={colors.textSecondary} />
        </View>
        <Text style={[styles.caption, { color: colors.textSecondary }]} numberOfLines={2}>
          {caption}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next day"
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={onNext}
        android_ripple={nextDisabled ? undefined : chevronRipple}
        style={styles.chevron}
        testID="day-next"
      >
        <ChevronRight size={size.icon.md} color={nextDisabled ? colors.textDisabled : colors.text} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.row,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs
  },
  chevron: {
    width: size.touch,
    minHeight: size.touch,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center"
  },
  centre: {
    flex: 1,
    minHeight: size.touch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs
  },
  title: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  caption: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    ...fonts.regular,
    fontVariant: ["tabular-nums"],
    marginTop: space.xxs
  }
})
