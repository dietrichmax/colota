/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useMemo, useCallback, useRef } from "react"
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from "react-native"
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react-native"
import { radius } from "@colota/shared"
import { ThemeColors } from "../../../types/global"
import { text } from "../../../styles/typography"
import { Button } from "../../ui/Button"
import { Divider } from "../../ui/Divider"
import { useTranslation } from "../../../i18n/useTranslation"
import { formatDistance } from "../../../utils/geo"
import { pad2 } from "../../../utils/format"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"

interface CalendarPickerProps {
  date: Date
  onDateChange: (date: Date) => void
  locationCount: number
  distance?: string
  colors: ThemeColors
  daysWithData: Set<string>
  daysWithNotes?: Set<string>
  dayDistances?: Map<string, number>
  onMonthChange: (year: number, month: number) => void
  onPrefetchMonth?: (year: number, month: number) => void
}

const DAY_CIRCLE = 32
const NOTE_DOT = 6
const DATA_DOT = 4

// 2024-01-01 was a Monday, so seven days from it name the week in the device's own locale
// and the grid stays Monday-first without seven hand-written abbreviations.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" })
)

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

export function CalendarPicker({
  date,
  onDateChange,
  locationCount,
  distance,
  colors,
  daysWithData,
  daysWithNotes,
  dayDistances,
  onMonthChange,
  onPrefetchMonth
}: CalendarPickerProps) {
  const { t } = useTranslation()
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

  const formatted = useMemo(
    () =>
      date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      }),
    [date]
  )

  const summary = distance
    ? t("history.day.summaryDistance", { count: locationCount, distance })
    : t("history.day.summary", { count: locationCount })

  const isFutureMonth =
    viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth >= today.getMonth())

  return (
    <View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Pressable
            testID="day-previous-btn"
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t("history.date.previous")}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.lg }}
            style={styles.navBtn}
          >
            <ChevronLeft size={size.icon.md} color={colors.text} />
          </Pressable>

          <Pressable
            testID="day-picker-btn"
            onPress={toggleExpanded}
            accessibilityRole="button"
            accessibilityLabel={formatted}
            accessibilityHint={t("history.date.open")}
            accessibilityState={{ expanded: isExpanded }}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
            style={styles.dateContainer}
          >
            <Text style={[styles.dateText, { color: colors.text }]}>{formatted}</Text>
            <Calendar size={size.icon.sm} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            testID="day-next-btn"
            onPress={goForward}
            disabled={isToday}
            accessibilityRole="button"
            accessibilityLabel={t("history.date.next")}
            accessibilityState={{ disabled: isToday }}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.lg }}
            style={styles.navBtn}
          >
            <ChevronRight size={size.icon.md} color={isToday ? colors.textDisabled : colors.text} />
          </Pressable>
        </View>

        <Text testID="day-summary" style={[styles.summary, { color: colors.textSecondary }]}>
          {summary}
        </Text>

        {!isToday && !isExpanded && (
          <Button
            testID="today-btn"
            title={t("history.date.today")}
            variant="ghost"
            align="start"
            onPress={goToToday}
          />
        )}

        {isExpanded && (
          <View style={styles.calendarContainer}>
            <View style={styles.monthRow}>
              <Pressable
                onPress={() => navigateMonth(-1)}
                accessibilityRole="button"
                accessibilityLabel={t("history.calendar.previousMonth")}
                android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.lg }}
                style={styles.navBtn}
              >
                <ChevronLeft size={size.icon.md} color={colors.text} />
              </Pressable>
              <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
              <Pressable
                onPress={() => navigateMonth(1)}
                disabled={isFutureMonth}
                accessibilityRole="button"
                accessibilityLabel={t("history.calendar.nextMonth")}
                accessibilityState={{ disabled: isFutureMonth }}
                android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.lg }}
                style={styles.navBtn}
              >
                <ChevronRight size={size.icon.md} color={isFutureMonth ? colors.textDisabled : colors.text} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((day) => (
                <Text key={day} style={[styles.weekdayText, { color: colors.textSecondary }]}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {calendarGrid.map((cell) => {
                if (cell.day === null) {
                  return <View key={cell.key} style={styles.dayCell} />
                }

                const dateKey = formatDateKey(viewYear, viewMonth, cell.day)
                const hasData = daysWithData.has(dateKey)
                const hasNote = daysWithNotes?.has(dateKey) ?? false
                const dist = dayDistances?.get(dateKey)
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
                    accessibilityRole="button"
                    accessibilityLabel={cellDate.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric"
                    })}
                    accessibilityState={{ selected: isSelected, disabled: isFuture }}
                  >
                    <View style={[styles.dayCircle, isSelected && { backgroundColor: colors.primary }]}>
                      <Text
                        style={[
                          styles.dayText,
                          { color: isFuture ? colors.textDisabled : isSelected ? colors.textOnPrimary : colors.text },
                          isCellToday && !isSelected && { color: colors.primary }
                        ]}
                      >
                        {cell.day}
                      </Text>
                      {hasNote && (
                        <View
                          style={[
                            styles.noteDot,
                            { backgroundColor: isSelected ? colors.textOnPrimary : colors.primary }
                          ]}
                        />
                      )}
                    </View>
                    {dist != null && dist > 0 ? (
                      <Text
                        style={[styles.dayDist, { color: isSelected ? colors.primary : colors.textLight }]}
                        numberOfLines={1}
                      >
                        {formatDistance(dist)}
                      </Text>
                    ) : hasData ? (
                      <View
                        style={[styles.dataDot, { backgroundColor: isSelected ? colors.primary : colors.textLight }]}
                      />
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          </View>
        )}
      </View>

      <Divider tight />
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  navBtn: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  dateContainer: {
    flex: 1,
    minHeight: size.touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm
  },
  dateText: {
    ...text.heading
  },
  summary: {
    ...text.caption,
    textAlign: "center"
  },
  calendarContainer: {
    marginTop: space.md
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm
  },
  monthLabel: {
    ...text.bodyStrong
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: space.xs
  },
  weekdayText: {
    ...text.caption,
    flex: 1,
    textAlign: "center"
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  dayCell: {
    width: "14.28%",
    paddingVertical: space.xs,
    alignItems: "center",
    justifyContent: "center"
  },
  dayCircle: {
    width: DAY_CIRCLE,
    height: DAY_CIRCLE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  dayText: {
    ...text.label
  },
  dayDist: {
    ...text.caption,
    marginTop: 1
  },
  dataDot: {
    width: DATA_DOT,
    height: DATA_DOT,
    borderRadius: radius.pill,
    marginTop: 2
  },
  noteDot: {
    position: "absolute",
    top: 1,
    end: 1,
    width: NOTE_DOT,
    height: NOTE_DOT,
    borderRadius: radius.pill
  }
})
