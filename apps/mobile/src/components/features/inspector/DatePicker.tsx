/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { ChevronLeft, ChevronRight } from "lucide-react-native"
import { ThemeColors } from "../../../types/global"
import { fonts } from "../../../styles/typography"

interface DatePickerProps {
  date: Date
  onDateChange: (date: Date) => void
  locationCount: number
  distance?: string
  colors: ThemeColors
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function DatePicker({ date, onDateChange, locationCount, distance, colors }: DatePickerProps) {
  const isToday = isSameDay(date, new Date())

  const goBack = () => {
    const prev = new Date(date)
    prev.setDate(prev.getDate() - 1)
    onDateChange(prev)
  }

  const goForward = () => {
    if (isToday) return
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    onDateChange(next)
  }

  const goToToday = () => {
    onDateChange(new Date())
  }

  const formatted = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  })

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <View style={styles.row}>
        <TouchableOpacity onPress={goBack} style={styles.navBtn} activeOpacity={0.6}>
          <ChevronLeft size={22} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={goToToday} style={styles.dateContainer} activeOpacity={0.7}>
          <Text style={[styles.dateText, { color: colors.text }]}>{formatted}</Text>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            {locationCount} {locationCount === 1 ? "location" : "locations"}
            {distance ? ` · ${distance}` : ""}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={goForward} style={styles.navBtn} activeOpacity={0.6} disabled={isToday}>
          <ChevronRight size={22} color={isToday ? colors.textDisabled : colors.primary} />
        </TouchableOpacity>
      </View>

      {!isToday && (
        <TouchableOpacity
          onPress={goToToday}
          style={[styles.todayBtn, { backgroundColor: colors.primary + "15" }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  navBtn: {
    padding: 8
  },
  dateContainer: {
    alignItems: "center",
    flex: 1
  },
  dateText: {
    fontSize: 15,
    ...fonts.bold
  },
  countText: {
    fontSize: 12,
    ...fonts.regular,
    marginTop: 2
  },
  todayBtn: {
    alignSelf: "center",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14
  },
  todayText: {
    fontSize: 12,
    ...fonts.semiBold
  }
})
