/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react"
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Switch } from "react-native"
import { fonts } from "../styles/typography"
import { ChevronLeft, ChevronRight } from "lucide-react-native"
import { Container, Card } from "../components"
import { useTheme } from "../hooks/useTheme"
import { ThemeColors } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { STATS_REFRESH_FAST } from "../constants"
import { logger } from "../utils/logger"
import { DatePicker } from "../components/features/inspector/DatePicker"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { computeTotalDistance, formatDistance } from "../utils/geo"

// Types
interface LocationData {
  id?: number
  timestamp?: number
  created_at?: number
  latitude: number
  longitude: number
  altitude?: number
  speed?: number
  accuracy?: number
  bearing?: number
  battery: number
  battery_status: number
}

interface LocationItemProps {
  item: LocationData
  colors: ThemeColors
  onTap?: (item: LocationData) => void
}

interface MetricProps {
  label: string
  value: string
  colors: ThemeColors
}

interface TabProps {
  label: string
  active: boolean
  onPress: () => void
  colors: ThemeColors
}

type TabType = "list" | "map"

/**
 * Memoized row component to prevent re-renders during scrolling
 */
const LocationItem = memo(({ item, colors, onTap }: LocationItemProps) => {
  const getBatteryStatus = (status: number): string => {
    switch (status) {
      case 0:
        return "Unknown"
      case 1:
        return "Unplugged"
      case 2:
        return "Charging"
      case 3:
        return "Full"
      default:
        return "Unknown"
    }
  }

  const timestamp = item.timestamp || item.created_at || Date.now()

  const card = (
    <Card style={styles.itemCard}>
      <View style={styles.row}>
        <Text style={[styles.id, { color: colors.primaryDark }]}>#{item.id}</Text>
        <Text style={[styles.time, { color: colors.textSecondary }]}>
          {new Date(timestamp * 1000).toLocaleTimeString()}
        </Text>
      </View>

      <Text style={[styles.coords, { color: colors.text }]}>
        {item.latitude?.toFixed(6)}°, {item.longitude?.toFixed(6)}°
      </Text>

      <View style={[styles.metricsGrid, { borderTopColor: colors.border }]}>
        <Metric label="Altitude" value={`${item.altitude?.toFixed(1) ?? 0}m`} colors={colors} />
        <Metric label="Speed" value={`${item.speed?.toFixed(1) ?? 0}m/s`} colors={colors} />
        <Metric label="Accuracy" value={`±${item.accuracy?.toFixed(1) ?? 0}m`} colors={colors} />
        <Metric label="Bearing" value={`${item.bearing?.toFixed(0) ?? 0}°`} colors={colors} />
      </View>

      <View style={[styles.metricsGrid, styles.batteryGrid, { borderTopColor: colors.border }]}>
        <Metric label="Battery" value={`${item.battery}%`} colors={colors} />
        <Metric label="Battery Status" value={getBatteryStatus(item.battery_status)} colors={colors} />
        <View style={styles.spacer} />
        <View style={styles.spacer} />
      </View>
    </Card>
  )

  if (onTap) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => onTap(item)}>
        {card}
      </TouchableOpacity>
    )
  }

  return card
})

LocationItem.displayName = "LocationItem"

export function LocationHistoryScreen() {
  const { colors, mode } = useTheme()
  const isDark = mode === "dark"
  const [activeTab, setActiveTab] = useState<TabType>("map")
  const [data, setData] = useState<LocationData[]>([])
  const [limit, setLimit] = useState(50)
  const [page, setPage] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Map tab state
  const [mapDate, setMapDate] = useState(new Date())
  const [trackLocations, setTrackLocations] = useState<LocationData[]>([])
  const [selectedPoint, setSelectedPoint] = useState<{ latitude: number; longitude: number } | null>(null)

  const dailyDistance = useMemo(() => {
    if (trackLocations.length < 2) return undefined
    const meters = computeTotalDistance(trackLocations)
    return formatDistance(meters)
  }, [trackLocations])

  const fetchIdRef = useRef(0)

  /** Fetches data based on current pagination */
  const fetchData = useCallback(async () => {
    const id = ++fetchIdRef.current
    try {
      const offset = page * limit
      const result = await NativeLocationService.getTableData("locations", limit, offset)
      if (id === fetchIdRef.current) setData(result || [])
    } catch (err) {
      logger.error("[LocationHistory] Fetch error:", err)
      if (id === fetchIdRef.current) setData([])
    }
  }, [limit, page])

  /** Fetch track data for the selected day */
  const fetchTrackData = useCallback(async () => {
    const id = ++fetchIdRef.current
    try {
      const start = new Date(mapDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(mapDate)
      end.setHours(23, 59, 59, 999)

      const startTimestamp = Math.floor(start.getTime() / 1000)
      const endTimestamp = Math.floor(end.getTime() / 1000)

      const result = await NativeLocationService.getLocationsByDateRange(startTimestamp, endTimestamp)
      if (id === fetchIdRef.current) setTrackLocations(result || [])
    } catch (err) {
      logger.error("[LocationHistory] Track fetch error:", err)
      if (id === fetchIdRef.current) setTrackLocations([])
    }
  }, [mapDate])

  /** Fetch table data when dependencies change */
  useEffect(() => {
    if (activeTab === "list") {
      fetchData()
    }
  }, [fetchData, activeTab])

  /** Fetch track data when map date changes */
  useEffect(() => {
    if (activeTab === "map") {
      fetchTrackData()
    }
  }, [fetchTrackData, activeTab])

  /** Auto-refresh logic */
  useEffect(() => {
    if (autoRefresh && activeTab === "list") {
      setPage(0)
      refreshInterval.current = setInterval(fetchData, STATS_REFRESH_FAST)
    } else {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current)
      }
    }
    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current)
      }
    }
  }, [autoRefresh, fetchData, activeTab])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    if (tab === "list") {
      setPage(0)
      setSelectedPoint(null)
    }
  }

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit)
    setPage(0)
  }

  /** Tap a location row in List → switch to Map and zoom */
  const handleLocationTap = (item: LocationData) => {
    if (item.latitude && item.longitude) {
      if (item.timestamp) {
        const itemDate = new Date(item.timestamp * 1000)
        setMapDate(itemDate)
      }
      setSelectedPoint({ latitude: item.latitude, longitude: item.longitude })
      setActiveTab("map")
    }
  }

  return (
    <Container>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <Tab label="Map" active={activeTab === "map"} onPress={() => handleTabChange("map")} colors={colors} />
        <Tab label="List" active={activeTab === "list"} onPress={() => handleTabChange("list")} colors={colors} />
      </View>

      {activeTab === "map" ? (
        <View style={styles.mapContainer}>
          <DatePicker
            date={mapDate}
            onDateChange={setMapDate}
            locationCount={trackLocations.length}
            distance={dailyDistance}
            colors={colors}
          />
          <TrackMap locations={trackLocations} selectedPoint={selectedPoint} colors={colors} isDark={isDark} />
        </View>
      ) : (
        <>
          {/* Header with Live Mode Toggle */}
          <View style={styles.headerRow}>
            <Text style={[styles.statusText, { color: autoRefresh ? colors.primary : colors.textSecondary }]}>
              {autoRefresh ? "● Live Mode" : "Manual Mode"}
            </Text>

            <View style={styles.controls}>
              <View style={styles.toggleContainer}>
                <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>LIVE</Text>
                <Switch
                  value={autoRefresh}
                  onValueChange={setAutoRefresh}
                  thumbColor={autoRefresh ? colors.primary : colors.border}
                />
              </View>

              <TouchableOpacity
                onPress={fetchData}
                disabled={autoRefresh}
                style={[
                  styles.refreshBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border
                  },
                  autoRefresh && styles.refreshBtnDisabled
                ]}
              >
                <Text style={[styles.btnText, { color: colors.primaryDark }]}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Limit Selection and Pagination */}
          <View style={styles.limitBar}>
            <View style={styles.limitOptions}>
              {[10, 50, 100].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => handleLimitChange(v)}
                  style={[
                    styles.limitBtn,
                    {
                      backgroundColor: limit === v ? colors.primary : colors.card,
                      borderColor: colors.border
                    }
                  ]}
                >
                  <Text style={[styles.limitBtnText, { color: limit === v ? colors.textOnPrimary : colors.text }]}>
                    {v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!autoRefresh && (
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  onPress={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={styles.pageBtn}
                >
                  <ChevronLeft size={20} color={page === 0 ? colors.textDisabled : colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.pageIndicator, { color: colors.text }]}>{page + 1}</Text>
                <TouchableOpacity
                  onPress={() => setPage((p) => p + 1)}
                  disabled={data.length < limit}
                  style={styles.pageBtn}
                >
                  <ChevronRight size={20} color={data.length < limit ? colors.textDisabled : colors.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Location List */}
          <FlatList
            data={data}
            contentContainerStyle={styles.listContent}
            keyExtractor={(item, index) => `loc-${item.id || index}`}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textLight }]}>No data available</Text>}
            renderItem={({ item }) => <LocationItem item={item} colors={colors} onTap={handleLocationTap} />}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        </>
      )}
    </Container>
  )
}

// Subcomponents
const Metric = ({ label, value, colors }: MetricProps) => (
  <View style={styles.metricItem}>
    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
  </View>
)

const Tab = ({ label, active, onPress, colors }: TabProps) => {
  const borderBottomColor = active ? colors.primary : "transparent"
  const textColor = active ? colors.primary : colors.textSecondary

  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, { borderBottomColor }]}>
      <Text style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive, { color: textColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12
  },
  statusText: {
    fontSize: 11,
    ...fonts.semiBold
  },
  controls: {
    flexDirection: "row",
    alignItems: "center"
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12
  },
  controlLabel: {
    fontSize: 10,
    ...fonts.bold,
    marginRight: 6
  },
  refreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1
  },
  refreshBtnDisabled: {
    opacity: 0.5
  },
  btnText: {
    fontSize: 12,
    ...fonts.bold
  },
  limitBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 12
  },
  limitOptions: {
    flexDirection: "row"
  },
  limitBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1
  },
  limitBtnText: {
    fontSize: 12,
    ...fonts.semiBold
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  pageBtn: {
    padding: 8
  },
  pageIndicator: {
    fontSize: 14,
    ...fonts.bold,
    marginHorizontal: 8
  },
  tabBar: {
    flexDirection: "row",
    marginBottom: 12
  },
  tab: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 2
  },
  tabText: {
    fontSize: 14
  },
  tabTextActive: {
    ...fonts.bold
  },
  tabTextInactive: {
    ...fonts.regular
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20
  },
  itemCard: {
    marginBottom: 10,
    padding: 12
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6
  },
  id: {
    ...fonts.bold,
    fontSize: 12
  },
  time: {
    fontSize: 11,
    ...fonts.regular
  },
  coords: {
    fontFamily: "monospace",
    fontSize: 15,
    ...fonts.semiBold,
    marginBottom: 8
  },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 4
  },
  batteryGrid: {
    paddingTop: 6,
    marginTop: 2
  },
  metricItem: {
    flex: 1,
    alignItems: "flex-start"
  },
  metricLabel: {
    fontSize: 9,
    ...fonts.bold,
    textTransform: "uppercase"
  },
  metricValue: {
    fontSize: 12,
    marginTop: 2
  },
  spacer: {
    flex: 1
  },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
    ...fonts.regular,
    fontStyle: "italic"
  }
})
