/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { View, Text, Pressable, StyleSheet, LayoutAnimation, ScrollView, type ScrollViewInstance } from "react-native"
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calendar } from "lucide-react-native"
import { ThemeColors } from "../../../types/global"
import { fontSizes, fonts } from "../../../styles/typography"
import { formatDistance } from "../../../utils/geo"
import { pad2 } from "../../../utils/format"
import { HIT_SLOP_LG, HIT_SLOP_MD, size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { radius } from "@colota/shared"

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

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
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
  const [isExpanded, setIsExpanded] = useState(false)
  const [viewYear, setViewYear] = useState(date.getFullYear())
  const [viewMonth, setViewMonth] = useState(date.getMonth())
  const [pane, setPane] = useState<Pane>("days")
  const [pickerYear, setPickerYear] = useState(viewYear)
  const yearScrollRef = useRef<ScrollViewInstance>(null)

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
    setPane("days")
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
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {/* Compact header row */}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={goBack}
          hitSlop={HIT_SLOP_LG}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: colors.pressedOpacity }]}
        >
          <ChevronLeft size={size.icon.md} color={colors.primary} />
        </Pressable>

        <Pressable
          testID="calendar-toggle-btn"
          onPress={toggleExpanded}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          style={({ pressed }) => [styles.dateContainer, pressed && { opacity: colors.pressedOpacity }]}
        >
          <View style={styles.dateLabelRow}>
            <Text style={[styles.dateText, { color: colors.text }]}>{formatted}</Text>
            {isToday && (
              <View style={[styles.todayBadge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.todayBadgeText, { color: colors.primary }]}>Today</Text>
              </View>
            )}
            <Calendar size={size.icon.sm} color={colors.textSecondary} style={styles.calendarIcon} />
          </View>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            {locationCount} {locationCount === 1 ? "location" : "locations"}
            {distance ? ` · ${distance}` : ""}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: isToday }}
          onPress={goForward}
          hitSlop={HIT_SLOP_LG}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: colors.pressedOpacity }]}
          disabled={isToday}
        >
          <ChevronRight size={size.icon.md} color={isToday ? colors.textDisabled : colors.primary} />
        </Pressable>
      </View>

      {!isToday && !isExpanded && (
        <Pressable
          accessibilityRole="button"
          onPress={goToToday}
          hitSlop={HIT_SLOP_LG}
          style={({ pressed }) => [
            styles.todayBtn,
            { backgroundColor: colors.primary + "15" },
            pressed && { opacity: colors.pressedOpacity }
          ]}
        >
          <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
        </Pressable>
      )}

      {/* Expanded calendar grid */}
      {isExpanded && (
        <View style={styles.calendarContainer}>
          {/* Month navigation, and the way into the year and month panes */}
          <View style={styles.monthRow}>
            {pane === "days" ? (
              <Pressable
                testID="prev-month-btn"
                onPress={() => navigateMonth(-1)}
                hitSlop={HIT_SLOP_LG}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={({ pressed }) => [styles.monthNav, pressed && { opacity: colors.pressedOpacity }]}
              >
                <ChevronLeft size={size.icon.md} color={colors.primary} />
              </Pressable>
            ) : (
              <View style={styles.monthNavSpacer} />
            )}
            <Pressable
              testID="calendar-pane-btn"
              onPress={goUp}
              hitSlop={HIT_SLOP_MD}
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
              <Pressable
                testID="next-month-btn"
                onPress={() => navigateMonth(1)}
                hitSlop={HIT_SLOP_LG}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={({ pressed }) => [styles.monthNav, pressed && { opacity: colors.pressedOpacity }]}
                disabled={isFutureMonth}
              >
                <ChevronRight size={size.icon.md} color={isFutureMonth ? colors.textDisabled : colors.primary} />
              </Pressable>
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
                        style={[styles.paneCellBtn, isViewed && { backgroundColor: colors.primaryContainer }]}
                      >
                        <Text
                          style={[
                            styles.paneCellText,
                            { color: content },
                            isCurrent && !isViewed && { color: colors.primary, ...fonts.bold }
                          ]}
                        >
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
                  const hasNote = daysWithNotes?.has(dateKey) ?? false
                  const dist = dayDistances?.get(dateKey)
                  const cellDate = new Date(viewYear, viewMonth, cell.day)
                  const isSelected = isSameDay(cellDate, date)
                  const isCellToday = isSameDay(cellDate, today)
                  const isFuture = cellDate > today

                  return (
                    <Pressable
                      key={cell.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled: isFuture }}
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
                        {hasNote && (
                          <View
                            style={[styles.noteDot, { backgroundColor: colors.primary, borderColor: colors.card }]}
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
            </>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  navBtn: {
    padding: space.sm
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
    fontSize: fontSizes.input,
    ...fonts.bold
  },
  todayBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  todayBadgeText: {
    fontSize: fontSizes.micro,
    ...fonts.bold
  },
  countText: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    marginTop: 2
  },
  todayBtn: {
    alignSelf: "center",
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: 6,
    borderRadius: 14
  },
  todayText: {
    fontSize: fontSizes.caption,
    ...fonts.semiBold
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
  monthNav: {
    padding: space.sm
  },
  monthNavSpacer: {
    width: size.iconColumn
  },
  monthLabel: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  monthLabelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs
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
    borderRadius: radius.sm
  },
  paneCellText: {
    fontSize: fontSizes.body,
    ...fonts.medium
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: space.xs
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSizes.small,
    ...fonts.semiBold
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
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  dayText: {
    fontSize: fontSizes.description,
    ...fonts.regular
  },
  dayDist: {
    fontSize: 9,
    ...fonts.medium,
    marginTop: 1
  },
  dataDot: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    marginTop: 2
  },
  noteDot: {
    position: "absolute",
    top: 1,
    right: 1,
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    borderWidth: 1
  }
})
