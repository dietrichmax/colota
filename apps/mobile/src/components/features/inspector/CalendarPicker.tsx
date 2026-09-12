/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { View, Text, Pressable, StyleSheet, LayoutAnimation, ScrollView, type ScrollViewInstance } from "react-native"
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react-native"
import { DailyStat, ThemeColors } from "../../../types/global"
import { fontSizes, fonts, lineHeights } from "../../../styles/typography"
import { spokenDistance } from "../../../utils/geo"
import { pad2 } from "../../../utils/format"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { radius } from "@colota/shared"
import { IconButton } from "../../ui/IconButton"

interface CalendarPickerProps {
  date: Date
  onSelectDay: (date: Date) => void
  colors: ThemeColors
  daysWithData: Set<string>
  dayStats: ReadonlyMap<string, DailyStat>
  onMonthChange: (year: number, month: number) => void
  onPrefetchMonth?: (year: number, month: number) => void
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const WEEK_LENGTH = WEEKDAYS.length
const MONTH_LABELS = Array.from({ length: 12 }, (_, m) =>
  new Date(2000, m, 1).toLocaleDateString(undefined, { month: "short" })
)

// Nothing on the bridge reports the oldest recorded point, so the year list runs to a floor
// instead. Material's own date picker defaults to 1900-2100, so a scrolling range is the norm.
const EARLIEST_YEAR = 2000
const YEAR_COLUMNS = 3
// A row is size.row so the cell inside still clears the 48dp touch target after its padding.
const YEAR_ROW_HEIGHT = size.row
const YEAR_PANE_ROWS = 5

type Pane = "days" | "months" | "years"

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

export function dayCellLabel(cellDate: Date, stat: DailyStat | undefined, isToday: boolean): string {
  const weekday = cellDate.toLocaleDateString(undefined, { weekday: "long" })
  const month = cellDate.toLocaleDateString(undefined, { month: "long" })
  const parts = [`${weekday} ${cellDate.getDate()} ${month}`]
  if (!stat || stat.count === 0) {
    parts.push("no data")
  } else if (stat.tripCount === 0) {
    parts.push("no trips", plural(stat.count, "point"))
  } else {
    parts.push(plural(stat.tripCount, "trip"), spokenDistance(stat.distanceMeters), plural(stat.count, "point"))
  }
  if (isToday) parts.push("today")
  return parts.join(", ")
}

export function CalendarPicker({
  date,
  onSelectDay,
  colors,
  daysWithData,
  dayStats,
  onMonthChange,
  onPrefetchMonth
}: CalendarPickerProps) {
  const [viewYear, setViewYear] = useState(date.getFullYear())
  const [viewMonth, setViewMonth] = useState(date.getMonth())
  const [pane, setPane] = useState<Pane>("days")
  const [pickerYear, setPickerYear] = useState(viewYear)
  const yearScrollRef = useRef<ScrollViewInstance>(null)

  const today = new Date()
  const todayRef = useRef(today)
  todayRef.current = today

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

  // The header always goes up a level: days to years, years back to days, months back to years.
  const goUp = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    if (pane === "days") {
      setPickerYear(viewYear)
      setPane("years")
    } else if (pane === "months") {
      setPane("years")
    } else {
      setPane("days")
    }
  }, [pane, viewYear])

  const selectYear = useCallback((year: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setPickerYear(year)
    setPane("months")
  }, [])

  // A jump has no direction, so unlike navigateMonth it prefetches no neighbour.
  const selectMonth = useCallback(
    (month: number) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      setViewYear(pickerYear)
      setViewMonth(month)
      setPane("days")
      onMonthChange(pickerYear, month)
    },
    [pickerYear, onMonthChange]
  )

  const selectDay = useCallback(
    (day: number) => {
      const selected = new Date(viewYear, viewMonth, day)
      if (selected > todayRef.current) return
      onSelectDay(selected)
    },
    [viewYear, viewMonth, onSelectDay]
  )

  const weeks = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    let startOffset = firstDay.getDay() - 1
    if (startOffset < 0) startOffset = 6
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const cells: (number | null)[] = Array.from({ length: startOffset }, () => null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % WEEK_LENGTH !== 0) cells.push(null)

    const rows: (number | null)[][] = []
    for (let i = 0; i < cells.length; i += WEEK_LENGTH) rows.push(cells.slice(i, i + WEEK_LENGTH))
    return rows
  }, [viewYear, viewMonth])

  const monthLabel = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
  }, [viewYear, viewMonth])

  const isFutureMonth =
    viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth >= today.getMonth())

  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth()
  const pickerYearLabel = new Date(pickerYear, 0, 1).toLocaleDateString(undefined, { year: "numeric" })

  const years = useMemo(
    () => Array.from({ length: todayYear - EARLIEST_YEAR + 1 }, (_, i) => todayYear - i),
    [todayYear]
  )

  // The list is long, so it opens on the year in view rather than at the top.
  useEffect(() => {
    if (pane !== "years") return
    const index = years.indexOf(pickerYear)
    const row = index < 0 ? 0 : Math.floor(index / YEAR_COLUMNS)
    const y = Math.max(0, row - Math.floor(YEAR_PANE_ROWS / 2)) * YEAR_ROW_HEIGHT
    yearScrollRef.current?.scrollTo({ y, animated: false })
  }, [pane, pickerYear, years])

  const headerLabel = pane === "months" ? pickerYearLabel : monthLabel
  const headerHint =
    pane === "days" ? "Opens the year picker" : pane === "years" ? "Closes the year picker" : "Back to the year picker"

  return (
    <View testID="calendar-picker">
      <View style={styles.monthRow}>
        {pane === "days" ? (
          <IconButton
            testID="prev-month-btn"
            icon={ChevronLeft}
            onPress={() => navigateMonth(-1)}
            accessibilityLabel="Previous month"
          />
        ) : (
          <View style={styles.monthNavSpacer} />
        )}
        <Pressable
          testID="calendar-pane-btn"
          onPress={goUp}
          accessibilityRole="button"
          accessibilityHint={headerHint}
          android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true }}
          style={styles.monthLabelBtn}
        >
          <Text style={[styles.monthLabel, { color: colors.text }]}>{headerLabel}</Text>
          {pane === "days" ? (
            <ChevronDown size={size.icon.sm} color={colors.textSecondary} />
          ) : (
            <ChevronUp size={size.icon.sm} color={colors.textSecondary} />
          )}
        </Pressable>
        {pane === "days" ? (
          <IconButton
            testID="next-month-btn"
            icon={ChevronRight}
            onPress={() => navigateMonth(1)}
            accessibilityLabel="Next month"
            disabled={isFutureMonth}
          />
        ) : (
          <View style={styles.monthNavSpacer} />
        )}
      </View>

      {pane === "years" && (
        <ScrollView ref={yearScrollRef} style={styles.pane} testID="year-pane">
          <View style={styles.paneGrid}>
            {years.map((year) => {
              const isViewed = year === pickerYear
              const isCurrent = year === todayYear
              const content = isViewed ? colors.onPrimaryContainer : colors.text
              return (
                <View key={year} style={styles.paneCell}>
                  <Pressable
                    testID={`year-${year}`}
                    onPress={() => selectYear(year)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isViewed }}
                    android_ripple={{ color: content + STATE_LAYER_ALPHA }}
                    style={[
                      styles.paneCellBtn,
                      isViewed && { backgroundColor: colors.primaryContainer },
                      isCurrent && !isViewed && { borderColor: colors.primary }
                    ]}
                  >
                    <Text style={[styles.paneCellText, { color: content }, isCurrent && !isViewed && fonts.bold]}>
                      {year}
                    </Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}

      {pane === "months" && (
        <View style={[styles.pane, styles.paneGrid]} testID="month-pane">
          {MONTH_LABELS.map((label, m) => {
            const isFuture = pickerYear > todayYear || (pickerYear === todayYear && m > todayMonth)
            const isViewed = pickerYear === viewYear && m === viewMonth
            const content = isFuture ? colors.textDisabled : isViewed ? colors.onPrimaryContainer : colors.text
            return (
              <View key={m} style={styles.paneCell}>
                <Pressable
                  testID={`month-${m}`}
                  onPress={() => selectMonth(m)}
                  disabled={isFuture}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isViewed, disabled: isFuture }}
                  android_ripple={isFuture ? undefined : { color: content + STATE_LAYER_ALPHA }}
                  style={[styles.paneCellBtn, isViewed && { backgroundColor: colors.primaryContainer }]}
                >
                  <Text style={[styles.paneCellText, { color: content }]}>{label}</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      )}

      {pane === "days" && (
        <>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={[styles.weekdayText, { color: colors.textSecondary }]}>
                {day}
              </Text>
            ))}
          </View>

          {weeks.map((week, w) => (
            <View key={`week-${w}`} style={styles.weekRow}>
              {week.map((day, i) => {
                if (day === null) {
                  return <View key={`empty-${i}`} style={styles.dayCell} />
                }

                const cellDate = new Date(viewYear, viewMonth, day)
                const dateKey = formatDateKey(viewYear, viewMonth, day)
                const hasData = daysWithData.has(dateKey)
                const isSelected = isSameDay(cellDate, date)
                const isCellToday = isSameDay(cellDate, today)
                const isFuture = cellDate > today
                const numeralColor = isFuture
                  ? colors.textDisabled
                  : isSelected
                    ? colors.textOnPrimary
                    : isCellToday || hasData
                      ? colors.text
                      : colors.textLight
                const numeralWeight =
                  isCellToday && !isSelected ? fonts.bold : hasData || isSelected ? fonts.semiBold : fonts.regular

                return (
                  <Pressable
                    key={dateKey}
                    testID={`day-${day}`}
                    accessibilityRole="button"
                    accessibilityLabel={dayCellLabel(cellDate, dayStats.get(dateKey), isCellToday)}
                    accessibilityState={{ selected: isSelected, disabled: isFuture }}
                    android_ripple={
                      isFuture
                        ? undefined
                        : { color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.touch / 2 }
                    }
                    style={styles.dayCell}
                    onPress={() => selectDay(day)}
                    disabled={isFuture}
                  >
                    <View
                      testID={`day-disc-${day}`}
                      style={[
                        styles.dayDisc,
                        isSelected && { backgroundColor: colors.primary },
                        isCellToday && !isSelected && { borderColor: colors.primary }
                      ]}
                    >
                      <Text style={[styles.dayText, numeralWeight, { color: numeralColor }]}>{day}</Text>
                      {hasData && (
                        <View
                          testID={`day-dot-${day}`}
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
          ))}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm
  },
  monthNavSpacer: {
    width: size.iconButton
  },
  monthLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  monthLabelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: size.touch,
    gap: space.sm,
    paddingHorizontal: space.sm
  },
  pane: {
    height: YEAR_ROW_HEIGHT * YEAR_PANE_ROWS
  },
  paneGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  paneCell: {
    width: "33.33%",
    height: YEAR_ROW_HEIGHT,
    padding: space.xs
  },
  paneCellBtn: {
    overflow: "hidden",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent"
  },
  paneCellText: {
    fontSize: fontSizes.body,
    ...fonts.medium
  },
  weekRow: {
    flexDirection: "row"
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    ...fonts.semiBold
  },
  dayCell: {
    flex: 1,
    minHeight: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  dayDisc: {
    width: size.iconColumn,
    height: size.iconColumn,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center"
  },
  dayText: {
    fontSize: fontSizes.description
  },
  dataDot: {
    width: space.xs,
    height: space.xs,
    borderRadius: radius.pill,
    marginTop: space.xxs
  }
})
