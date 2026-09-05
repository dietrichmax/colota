/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useLayoutEffect, useRef } from "react"
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  type ScrollViewInstance
} from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Share2, Search, X, ArrowDown } from "lucide-react-native"
import { fontSizes, fonts } from "../styles/typography"
import { Container, SectionTitle } from "../components"
import { Tab } from "../components/ui/Tab"
import { FileLoggingPanel } from "../components/features/log/FileLoggingPanel"
import { useTheme } from "../hooks/useTheme"
import { logger, LOG_LEVELS, type LogLevel } from "../utils/logger"
import { getMergedLogs, exportLogs, MergedLogEntry } from "../utils/logExport"
import NativeLocationService from "../services/NativeLocationService"
import { ScreenProps } from "../types/global"
import { size, space } from "../constants"
import { radius } from "@colota/shared"

type FilterLevel = LogLevel

type LogTab = "live" | "file"

export function ActivityLogScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<LogTab>("live")
  const [logs, setLogs] = useState<MergedLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeLevels, setActiveLevels] = useState<Set<FilterLevel>>(new Set(LOG_LEVELS))
  const [showScrollEnd, setShowScrollEnd] = useState(false)
  const isNearEnd = useRef(true)
  const scrollRef = useRef<ScrollViewInstance>(null)

  const loadLogs = useCallback(async () => {
    try {
      const merged = await getMergedLogs()
      setLogs(merged)
    } catch (err) {
      logger.error("[ActivityLogScreen] Failed to load logs:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleContentSizeChange = useCallback(() => {
    if (isNearEnd.current) {
      scrollRef.current?.scrollToEnd({ animated: false })
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (tab !== "live") return
      loadLogs()
      const interval = setInterval(loadLogs, 3000)
      return () => clearInterval(interval)
    }, [loadLogs, tab])
  )

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const buildConfig = NativeLocationService.getBuildConfig()
      let deviceInfo = null
      try {
        const info = await NativeLocationService.getDeviceInfo()
        deviceInfo = { ...info, apiLevel: String(info.apiLevel) }
      } catch {}
      await exportLogs(buildConfig, deviceInfo)
    } catch (err) {
      logger.error("[ActivityLogScreen] Export failed:", err)
    } finally {
      setExporting(false)
    }
  }, [])

  const handleScroll = useCallback(({ nativeEvent }: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent
    const distanceFromEnd = contentSize.height - contentOffset.y - layoutMeasurement.height
    isNearEnd.current = distanceFromEnd < 100
    setShowScrollEnd(distanceFromEnd > 200)
  }, [])

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true })
    isNearEnd.current = true
    setShowScrollEnd(false)
  }, [])

  const headerRight = useCallback(
    () => (
      <View style={styles.headerButtons}>
        <Pressable
          onPress={handleExport}
          disabled={exporting}
          style={({ pressed }) => [styles.headerButton, pressed && { opacity: colors.pressedOpacity }]}
        >
          {exporting ? (
            <ActivityIndicator size={size.icon.md} color={colors.primary} />
          ) : (
            <Share2 size={size.icon.md} color={colors.primary} />
          )}
        </Pressable>
      </View>
    ),
    [handleExport, exporting, colors]
  )

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight })
  }, [navigation, headerRight])

  const toggleLevel = useCallback((level: FilterLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) {
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }, [])

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const level of LOG_LEVELS) counts[level] = 0
    for (const entry of logs) {
      if (entry.level in counts) counts[entry.level]++
    }
    return counts
  }, [logs])

  const filteredLogs = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return logs.filter((entry) => {
      const levelMatch = entry.level === "NATIVE" || activeLevels.has(entry.level as FilterLevel)
      if (!levelMatch) return false
      if (query && !entry.message.toLowerCase().includes(query)) return false
      return true
    })
  }, [logs, searchQuery, activeLevels])

  const levelColor = useCallback(
    (level: MergedLogEntry["level"]) => {
      switch (level) {
        case "DEBUG":
          return colors.textLight
        case "INFO":
          return colors.info
        case "WARN":
          return colors.warning
        case "ERROR":
          return colors.error
        default:
          return colors.textSecondary
      }
    },
    [colors]
  )

  const tabBar = (
    <View style={styles.tabBar}>
      <Tab label="Live" active={tab === "live"} onPress={() => setTab("live")} colors={colors} />
      <Tab label="File" active={tab === "file"} onPress={() => setTab("file")} colors={colors} />
    </View>
  )

  if (loading && tab === "live") {
    return (
      <Container>
        {tabBar}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Container>
    )
  }

  if (tab === "file") {
    return (
      <Container>
        {tabBar}
        <FileLoggingPanel />
      </Container>
    )
  }

  return (
    <Container>
      {tabBar}
      <View style={styles.filterBar}>
        <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={size.icon.sm} color={colors.textLight} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Filter logs..."
            placeholderTextColor={colors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <X size={size.icon.sm} color={colors.textLight} />
            </Pressable>
          )}
        </View>

        <View style={styles.levelChips}>
          {LOG_LEVELS.map((level) => {
            const active = activeLevels.has(level)
            const color = levelColor(level)
            const count = levelCounts[level] || 0
            return (
              <Pressable
                key={level}
                onPress={() => toggleLevel(level)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? color : colors.surface
                  }
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.textOnPrimary : colors.textLight }]}>
                  {level}
                  {count > 0 ? ` ${count}` : ""}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={[styles.separator, { backgroundColor: colors.border }]} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={handleContentSizeChange}
      >
        {filteredLogs.length > 0 ? (
          <>
            <SectionTitle>Entries ({filteredLogs.length})</SectionTitle>
            <Text style={[styles.logText, { color: colors.text }]} selectable>
              {filteredLogs
                .map((item) => {
                  const level = item.level === "NATIVE" ? "NATIVE" : item.level
                  const time =
                    item.time > 0
                      ? new Date(item.time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit"
                        })
                      : "        "
                  return `[${time}] [${level}] ${item.message}`
                })
                .join("\n")}
            </Text>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {logs.length === 0 ? "No log entries yet" : "No logs match your filter"}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textLight }]}>
              {logs.length === 0
                ? "Logs are collected automatically as the app runs"
                : "Try adjusting your search or level filters"}
            </Text>
          </View>
        )}
      </ScrollView>

      {showScrollEnd ? (
        <Pressable
          onPress={scrollToEnd}
          style={[styles.scrollEndButton, { backgroundColor: colors.primary, bottom: insets.bottom + 24 }]}
        >
          <ArrowDown size={size.icon.md} color={colors.textOnPrimary} />
        </Pressable>
      ) : filteredLogs.length > 0 ? (
        <View style={[styles.followingBadge, { backgroundColor: colors.primary + "20", bottom: insets.bottom + 24 }]}>
          <Text style={[styles.followingText, { color: colors.primary }]}>Following</Text>
        </View>
      ) : null}
    </Container>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    marginBottom: space.md
  },
  list: {
    padding: space.lg,
    paddingBottom: 40
  },
  headerButtons: {
    flexDirection: "row",
    gap: space.sm
  },
  headerButton: {
    padding: space.sm
  },
  filterBar: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.sm
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    height: 40,
    gap: space.sm
  },
  searchInput: {
    flex: 1,
    ...fonts.regular,
    fontSize: fontSizes.body,
    padding: 0
  },
  levelChips: {
    flexDirection: "row",
    gap: 6
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.md
  },
  separator: {
    height: 1,
    marginHorizontal: space.lg,
    marginTop: space.xs
  },
  chipText: {
    ...fonts.semiBold,
    fontSize: fontSizes.small
  },
  logText: {
    ...fonts.regular,
    fontSize: fontSizes.caption,
    fontFamily: "monospace",
    lineHeight: 18
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  empty: {
    alignItems: "center",
    paddingTop: 40
  },
  emptyText: {
    fontSize: fontSizes.input,
    ...fonts.medium,
    marginBottom: 6
  },
  emptyHint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    textAlign: "center",
    lineHeight: 18
  },
  scrollEndButton: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4
  },
  followingBadge: {
    position: "absolute",
    bottom: 24,
    right: 24,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.lg
  },
  followingText: {
    ...fonts.medium,
    fontSize: fontSizes.small
  }
})
