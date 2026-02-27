/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Animated,
  RefreshControl,
  StyleProp,
  TextStyle
} from "react-native"
import { Route, Calendar, MapPin, TrendingUp, ChevronRight } from "lucide-react-native"
import { Container, Card } from "../components"
import { ChipGroup } from "../components/ui/ChipGroup"
import { useTheme } from "../hooks/useTheme"
import { DailyStat } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { formatDistance, formatDuration } from "../utils/geo"
import { fonts } from "../styles/typography"
import { logger } from "../utils/logger"

type Period = "week" | "month" | "30days"

const PERIOD_OPTIONS = [
  { value: "week" as const, label: "This Week" },
  { value: "month" as const, label: "This Month" },
  { value: "30days" as const, label: "Last 30 Days" }
]
const COUNT_UP_DURATION = 600 // ms

function getDateRange(period: Period): { start: number; end: number } {
  const now = new Date()
  const endTs = Math.floor(now.getTime() / 1000)

  let startDate: Date
  if (period === "week") {
    startDate = new Date(now)
    const dayOfWeek = startDate.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    startDate.setDate(startDate.getDate() - diff)
  } else if (period === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  } else {
    startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 29)
  }

  startDate.setHours(0, 0, 0, 0)
  return { start: Math.floor(startDate.getTime() / 1000), end: endTs }
}

/** Animated number that counts up from 0 to target */
function AnimatedNumber({
  value,
  format,
  style
}: {
  value: number
  format: (n: number) => string
  style: StyleProp<TextStyle>
}) {
  const animRef = useRef(new Animated.Value(0)).current
  const [display, setDisplay] = useState(format(0))
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    animRef.setValue(0)
    const listener = animRef.addListener(({ value: v }) => {
      if (mountedRef.current) setDisplay(format(Math.round(v)))
    })
    Animated.timing(animRef, { toValue: value, duration: COUNT_UP_DURATION, useNativeDriver: false }).start()
    return () => {
      animRef.stopAnimation()
      animRef.removeListener(listener)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return <Text style={style}>{display}</Text>
}

export function LocationSummaryScreen({ navigation }: { navigation: any }) {
  const { colors } = useTheme()
  const [period, setPeriod] = useState<Period>("week")
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange(period)
      const stats = await NativeLocationService.getDailyStats(start, end)
      setDailyStats(stats)
    } catch (err) {
      logger.error("[LocationSummary] Failed to fetch stats:", err)
      setDailyStats([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Pull-to-refresh
  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetchStats()
  }, [fetchStats])

  const summary = useMemo(() => {
    const totalDistance = dailyStats.reduce((sum, d) => sum + d.distanceMeters, 0)
    const totalTrips = dailyStats.reduce((sum, d) => sum + d.tripCount, 0)
    const activeDays = dailyStats.length
    const avgDistance = activeDays > 0 ? totalDistance / activeDays : 0

    return { totalDistance, totalTrips, activeDays, avgDistance }
  }, [dailyStats])

  const formatDayLabel = useCallback((dayStr: string) => {
    const [year, month, day] = dayStr.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  }, [])

  // Tap daily stat → navigate to Inspector for that day
  const handleDayPress = useCallback(
    (dayStr: string) => {
      const [year, month, day] = dayStr.split("-").map(Number)
      const date = new Date(year, month - 1, day)
      navigation.navigate("Location History", { initialDate: date.getTime(), initialTab: "trips" })
    },
    [navigation]
  )

  const renderDailyStat = useCallback(
    ({ item }: { item: DailyStat }) => (
      <Pressable onPress={() => handleDayPress(item.day)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Card style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <Text style={[styles.dayLabel, { color: colors.text }]}>{formatDayLabel(item.day)}</Text>
            <View style={styles.dayHeaderRight}>
              <Text style={[styles.dayDistance, { color: colors.primary }]}>{formatDistance(item.distanceMeters)}</Text>
              <ChevronRight size={14} color={colors.textDisabled} />
            </View>
          </View>
          <View style={styles.dayStats}>
            <Text style={[styles.dayStat, { color: colors.textSecondary }]}>
              {item.tripCount} {item.tripCount === 1 ? "trip" : "trips"}
            </Text>
            <Text style={[styles.dayStat, { color: colors.textSecondary }]}>{item.count} points</Text>
            <Text style={[styles.dayStat, { color: colors.textSecondary }]}>
              {formatDuration(item.endTime - item.startTime)}
            </Text>
          </View>
        </Card>
      </Pressable>
    ),
    [colors, formatDayLabel, handleDayPress]
  )

  const summaryHeader = useMemo(
    () => (
      <View style={styles.summaryGrid}>
        <Card style={styles.summaryCard}>
          <Route size={16} color={colors.primary} />
          <AnimatedNumber
            value={summary.totalDistance}
            format={(n) => formatDistance(n)}
            style={[styles.summaryValue, { color: colors.text }]}
          />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Distance</Text>
        </Card>

        <Card style={styles.summaryCard}>
          <MapPin size={16} color={colors.primary} />
          <AnimatedNumber
            value={summary.totalTrips}
            format={(n) => String(n)}
            style={[styles.summaryValue, { color: colors.text }]}
          />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Trips</Text>
        </Card>

        <Card style={styles.summaryCard}>
          <Calendar size={16} color={colors.primary} />
          <AnimatedNumber
            value={summary.activeDays}
            format={(n) => String(n)}
            style={[styles.summaryValue, { color: colors.text }]}
          />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Active Days</Text>
        </Card>

        <Card style={styles.summaryCard}>
          <TrendingUp size={16} color={colors.primary} />
          <AnimatedNumber
            value={summary.avgDistance}
            format={(n) => formatDistance(n)}
            style={[styles.summaryValue, { color: colors.text }]}
          />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Avg / Day</Text>
        </Card>
      </View>
    ),
    [summary, colors]
  )

  return (
    <Container>
      <View style={styles.header}>
        <ChipGroup options={PERIOD_OPTIONS} selected={period} onSelect={setPeriod} colors={colors} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={dailyStats}
          renderItem={renderDailyStat}
          keyExtractor={(item) => item.day}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={summaryHeader}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No data for this period</Text>
          }
        />
      )}
    </Container>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 8
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16
  },
  summaryCard: {
    flexBasis: "45%",
    flexGrow: 1,
    flexShrink: 0,
    alignItems: "center",
    padding: 12,
    gap: 2
  },
  summaryValue: {
    fontSize: 18,
    ...fonts.bold
  },
  summaryLabel: {
    fontSize: 10,
    ...fonts.semiBold,
    textTransform: "uppercase"
  },
  dayCard: {
    marginBottom: 8,
    padding: 12
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  dayHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  dayLabel: {
    fontSize: 14,
    ...fonts.bold
  },
  dayDistance: {
    fontSize: 14,
    ...fonts.bold
  },
  dayStats: {
    flexDirection: "row",
    gap: 16
  },
  dayStat: {
    fontSize: 12,
    ...fonts.regular
  },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
    ...fonts.regular
  }
})
