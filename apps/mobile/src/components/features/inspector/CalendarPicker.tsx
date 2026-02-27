/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useMemo, useCallback, useRef } from "react"
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from "react-native"
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react-native"
import { ThemeColors } from "../../../types/global"
import { fonts } from "../../../styles/typography"

interface CalendarPickerProps {
  date: Date
  onDateChange: (date: Date) => void
  locationCount: number
  distance?: string
  colors: ThemeColors
  daysWithData: Set<string>
  onMonthChange: (year: number, month: number) => void
  onPrefetchMonth?: (year: number, month: number) => void
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function CalendarPicker({
  date,
  onDateChange,
  locationCount,
  distance,
  colors,
  daysWithData,
  onMonthChange,
  onPrefetchMonth
}: CalendarPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [viewYear, setViewYear] = useState(date.getFullYear())
  const [viewMonth, setViewMonth] = useState(date.getMonth())

  const today = new Date()
  const todayRef = useRef(today)
  todayRef.current = today
  const isToday = isSameDay(date, today)

  const goBack = useCallback(() => {
    const prev = new Date(date)
    prev.setDate(prev.getDate() - 1)
    onDateChange(prev)
  }, [date, onDateChange])

  const goForward = useCallback(() => {
    if (isSameDay(date, todayRef.current)) return
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    onDateChange(next)
  }, [date, onDateChange])

  const goToToday = useCallback(() => {
    onDateChange(new Date())
  }, [onDateChange])

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    if (!isExpanded) {
      setViewYear(date.getFullYear())
      setViewMonth(date.getMonth())
    }
    setIsExpanded((prev) => !prev)
  }, [isExpanded, date])

  const navigateMonth = useCallback(
    (delta: number) => {
      let newMonth = viewMonth + delta
      let newYear = viewYear
      if (newMonth < 0) {
        newMonth = 11
        newYear--
      } else if (newMonth > 11) {
        newMonth = 0
        newYear++
      }
      setViewYear(newYear)
      setViewMonth(newMonth)
      onMonthChange(newYear, newMonth)

      // Prefetch adjacent month (cache only, no state update)
      if (onPrefetchMonth) {
        const adjMonth = newMonth + delta
        if (adjMonth < 0) {
          onPrefetchMonth(newYear - 1, 11)
        } else if (adjMonth > 11) {
          onPrefetchMonth(newYear + 1, 0)
        } else {
          onPrefetchMonth(newYear, adjMonth)
        }
      }
    },
    [viewMonth, viewYear, onMonthChange, onPrefetchMonth]
  )

  const selectDay = useCallback(
    (day: number) => {
      const selected = new Date(viewYear, viewMonth, day)
      if (selected > todayRef.current) return
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      onDateChange(selected)
      setIsExpanded(false)
    },
    [viewYear, viewMonth, onDateChange]
  )

  const calendarGrid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    let startOffset = firstDay.getDay() - 1
    if (startOffset < 0) startOffset = 6
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const cells: { day: number | null; key: string }[] = []
    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, key: `empty-${i}` })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, key: `day-${d}` })
    }
    return cells
  }, [viewYear, viewMonth])

  const monthLabel = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
  }, [viewYear, viewMonth])

  const formatted = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  })

  const isFutureMonth =
    viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth >= today.getMonth())

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {/* Compact header row */}
      <View style={styles.row}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}>
          <ChevronLeft size={22} color={colors.primary} />
        </Pressable>

        <Pressable
          onPress={toggleExpanded}
          style={({ pressed }) => [styles.dateContainer, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.dateLabelRow}>
            <Text style={[styles.dateText, { color: colors.text }]}>{formatted}</Text>
            {isToday && (
              <View style={[styles.todayBadge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.todayBadgeText, { color: colors.primary }]}>Today</Text>
              </View>
            )}
            <Calendar size={14} color={colors.textSecondary} style={styles.calendarIcon} />
          </View>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            {locationCount} {locationCount === 1 ? "location" : "locations"}
            {distance ? ` · ${distance}` : ""}
          </Text>
        </Pressable>

        <Pressable
          onPress={goForward}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
          disabled={isToday}
        >
          <ChevronRight size={22} color={isToday ? colors.textDisabled : colors.primary} />
        </Pressable>
      </View>

      {!isToday && !isExpanded && (
        <Pressable
          onPress={goToToday}
          style={({ pressed }) => [
            styles.todayBtn,
            { backgroundColor: colors.primary + "15" },
            pressed && { opacity: 0.7 }
          ]}
        >
          <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
        </Pressable>
      )}

      {/* Expanded calendar grid */}
      {isExpanded && (
        <View style={styles.calendarContainer}>
          {/* Month navigation */}
          <View style={styles.monthRow}>
            <Pressable
              onPress={() => navigateMonth(-1)}
              style={({ pressed }) => [styles.monthNav, pressed && { opacity: 0.6 }]}
            >
              <ChevronLeft size={18} color={colors.primary} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
            <Pressable
              onPress={() => navigateMonth(1)}
              style={({ pressed }) => [styles.monthNav, pressed && { opacity: 0.6 }]}
              disabled={isFutureMonth}
            >
              <ChevronRight size={18} color={isFutureMonth ? colors.textDisabled : colors.primary} />
            </Pressable>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={[styles.weekdayText, { color: colors.textSecondary }]}>
                {day}
              </Text>
            ))}
          </View>

          {/* Day cells */}
          <View style={styles.daysGrid}>
            {calendarGrid.map((cell) => {
              if (cell.day === null) {
                return <View key={cell.key} style={styles.dayCell} />
              }

              const dateKey = formatDateKey(viewYear, viewMonth, cell.day)
              const hasData = daysWithData.has(dateKey)
              const cellDate = new Date(viewYear, viewMonth, cell.day)
              const isSelected = isSameDay(cellDate, date)
              const isCellToday = isSameDay(cellDate, today)
              const isFuture = cellDate > today

              return (
                <Pressable
                  key={cell.key}
                  style={styles.dayCell}
                  onPress={() => selectDay(cell.day!)}
                  disabled={isFuture}
                >
                  <View style={[styles.dayCircle, isSelected && { backgroundColor: colors.primary }]}>
                    <Text
                      style={[
                        styles.dayText,
                        { color: isFuture ? colors.textDisabled : isSelected ? colors.textOnPrimary : colors.text },
                        isCellToday && !isSelected && { color: colors.primary, ...fonts.bold }
                      ]}
                    >
                      {cell.day}
                    </Text>
                    {hasData && (
                      <View
                        style={[
                          styles.dataDot,
                          { backgroundColor: isSelected ? colors.textOnPrimary : colors.primary }
                        ]}
                      />
                    )}
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>
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
  dateLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  calendarIcon: {
    marginTop: 1
  },
  dateText: {
    fontSize: 15,
    ...fonts.bold
  },
  todayBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  todayBadgeText: {
    fontSize: 10,
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
  },
  calendarContainer: {
    marginTop: 12
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  monthNav: {
    padding: 4
  },
  monthLabel: {
    fontSize: 14,
    ...fonts.semiBold
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 4
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    ...fonts.semiBold
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  dayText: {
    fontSize: 13,
    ...fonts.regular
  },
  dataDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1
  }
})
