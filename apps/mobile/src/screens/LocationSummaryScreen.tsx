/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { Route, Calendar, CalendarX, MapPin, TrendingUp } from "lucide-react-native"
import { Card, Container, Divider, EmptyState, ListItem, StatRow, StepperHeader } from "../components"
import { Tab } from "../components/ui/Tab"
import { useTheme } from "../hooks/useTheme"
import { DailyStat } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { formatDistance, formatDuration } from "../utils/geo"
import { logger } from "../utils/logger"
import { space } from "../constants"
import { dateOfDayKey, daysInRange, periodRange, periodTotals, rangeBounds, type Period } from "../utils/summaryPeriod"

// A year or all time would walk every row in the database; they return with a native daily rollup.
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" }
]

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

function dayLabel(day: string): string {
  return dateOfDayKey(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

export function LocationSummaryScreen({ navigation }: { navigation: any }) {
  const { colors } = useTheme()
  const [period, setPeriod] = useState<Period>("week")
  const [offset, setOffset] = useState(0)
  // One read per shown period: the native daily stats walk every row in their window, so all
  // history is read only when All asks for it.
  const [cache, setCache] = useState<Record<string, DailyStat[]>>({})
  const [focusCount, setFocusCount] = useState(0)
  const requestRef = useRef(0)

  useFocusEffect(
    useCallback(() => {
      setCache({})
      setFocusCount((n) => n + 1)
    }, [])
  )

  const now = new Date()
  const key = `${period}:${offset}`
  const stats = cache[key] ?? null
  const range = periodRange(period, offset, now)

  useEffect(() => {
    if (focusCount === 0 || cache[key]) return
    const request = ++requestRef.current
    const { start, end } = rangeBounds(range, new Date())
    NativeLocationService.getDailyStats(start, end)
      .then((rows) => {
        if (request === requestRef.current) setCache((c) => ({ ...c, [key]: rows }))
      })
      .catch((err) => {
        logger.error("[LocationSummary] Failed to fetch stats:", err)
        if (request === requestRef.current) setCache((c) => ({ ...c, [key]: [] }))
      })
    // The range follows the key, and focusCount forces a fresh read after the cache is cleared.
  }, [key, focusCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = daysInRange(stats ?? [], range)
  const totals = periodTotals(days)

  const choosePeriod = useCallback((next: Period) => {
    setPeriod(next)
    setOffset(0)
  }, [])

  const openDay = useCallback(
    (day: string) =>
      navigation.navigate("Location History", { initialDate: dateOfDayKey(day).getTime(), initialTab: "trips" }),
    [navigation]
  )

  return (
    <Container>
      <StepperHeader
        title={range.title}
        caption={range.caption}
        onPrevious={() => setOffset((o) => o + 1)}
        onNext={() => setOffset((o) => Math.max(0, o - 1))}
        previousLabel={`Previous ${period}`}
        nextLabel={`Next ${period}`}
        nextDisabled={offset === 0}
        testID="period"
      />
      <View style={styles.tabs} accessibilityRole="tablist">
        {PERIODS.map((p) => (
          <Tab
            key={p.value}
            label={p.label}
            active={period === p.value}
            onPress={() => choosePeriod(p.value)}
            colors={colors}
          />
        ))}
      </View>
      <Divider tight />
      {stats === null ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : days.length === 0 ? (
        <EmptyState icon={CalendarX} title="Nothing recorded" hint={range.caption} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card rows testID="period-ledger">
            <StatRow icon={Route} label="Distance" value={formatDistance(totals.distanceMeters)} />
            <Divider tight inset />
            <StatRow icon={MapPin} label="Trips" value={String(totals.trips)} />
            <Divider tight inset />
            <StatRow icon={Calendar} label="Active days" value={String(totals.activeDays)} />
            <Divider tight inset />
            <StatRow icon={TrendingUp} label="Avg / day" value={formatDistance(totals.avgPerDay)} />
          </Card>
          {
            <Card rows testID="period-days">
              {days.map((day, i) => (
                <React.Fragment key={day.day}>
                  {i > 0 && <Divider tight inset />}
                  <ListItem
                    icon={Calendar}
                    label={dayLabel(day.day)}
                    sub={`${formatDistance(day.distanceMeters)} · ${count(day.tripCount, "trip")} · ${count(day.count, "point")} · ${formatDuration(day.endTime - day.startTime)}`}
                    onPress={() => openDay(day.day)}
                    accessibilityHint="Opens the day in Location History"
                    testID={`day-${day.day}`}
                  />
                </React.Fragment>
              ))}
            </Card>
          }
        </ScrollView>
      )}
    </Container>
  )
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row"
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg
  }
})
