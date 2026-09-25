/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { ArrowDown, FileSearch, RefreshCw, Search, X } from "lucide-react-native"
import { ChipGroup, Container, Divider, EmptyState, HeaderAction } from "../components"
import { MapActionButton } from "../components/features/map/MapActionButton"
import { useTheme } from "../hooks/useTheme"
import { useTimeout } from "../hooks/useTimeout"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { getMergedLogs, type MergedLogEntry } from "../utils/logExport"
import {
  countByFloor,
  DEFAULT_LOG_FLOOR,
  floorOptions,
  levelLetter,
  logTime,
  passesFloor,
  resultLine,
  rowLabel,
  type LogFloor
} from "../utils/logCapture"
import type { ThemeColors } from "../types/global"
import type { LogLevel } from "../utils/logger"
import { fonts, fontSizes, lineHeights, type } from "../styles/typography"
import { HIT_SLOP_MD, LOG_FILTER_DEBOUNCE_MS, size, space, STATE_LAYER_ALPHA } from "../constants"
import { radius } from "@colota/shared"
import type { ScreenProps } from "../types/global"
import { useTranslation } from "../i18n/useTranslation"

function levelColor(level: LogLevel, colors: ThemeColors): string {
  switch (level) {
    case "ERROR":
      return colors.error
    case "WARN":
      return colors.warning
    case "INFO":
      return colors.info
    default:
      return colors.textLight
  }
}

/** Module level, or the list sees a new component type on every render. */
function LogLine({ entry }: { entry: MergedLogEntry }) {
  const { colors } = useTheme()
  const stamp = logTime(entry.time)
  return (
    <View style={styles.line} accessibilityRole="text" accessibilityLabel={rowLabel(entry, stamp)}>
      <Text style={[styles.mono, { color: levelColor(entry.level, colors) }]}>{levelLetter(entry.level)}</Text>
      <Text style={[styles.mono, { color: colors.textSecondary }]}>{stamp}</Text>
      <Text style={[styles.mono, styles.body, { color: colors.text }]} selectable>
        {entry.message}
      </Text>
    </View>
  )
}

export function LogPreviewScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const debounce = useTimeout()

  const [entries, setEntries] = useState<MergedLogEntry[]>([])
  const [fromFile, setFromFile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")
  const [query, setQuery] = useState("")
  const [floor, setFloor] = useState<LogFloor>(DEFAULT_LOG_FLOOR)

  const loadRef = useRef(false)
  const listRef = useRef<FlatList<MergedLogEntry>>(null)
  const [awayFromNewest, setAwayFromNewest] = useState(false)

  const load = useCallback(async () => {
    if (loadRef.current) return
    loadRef.current = true
    try {
      const [merged, enabled] = await Promise.all([
        getMergedLogs(),
        NativeLocationService.getSetting("debugFileLoggingEnabled", "false")
      ])
      // Newest first into an inverted list, which reads oldest to newest and opens on the newest line.
      setEntries(merged.slice().reverse())
      setFromFile(enabled === "true")
    } catch (err) {
      logger.error("[LogPreviewScreen] Failed to load logs:", err)
    } finally {
      loadRef.current = false
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const headerRight = useCallback(
    () => (
      <HeaderAction
        icon={RefreshCw}
        label={t("preview.refresh")}
        hint={t("preview.refresh.hint")}
        onPress={load}
        testID="refresh-log-btn"
      />
    ),
    [load, t]
  )

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight })
  }, [navigation, headerRight])

  const handleType = useCallback(
    (next: string) => {
      setText(next)
      debounce.set(() => setQuery(next), LOG_FILTER_DEBOUNCE_MS)
    },
    [debounce]
  )

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setAwayFromNewest(event.nativeEvent.contentOffset.y > size.row)
  }, [])

  const jumpToNewest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
  }, [])

  const clear = useCallback(() => {
    debounce.clear()
    setText("")
    setQuery("")
  }, [debounce])

  // Counted over the search-matched set, so a chip's number and the result line's agree.
  const matched = useMemo(() => {
    if (!query) return entries
    const needle = query.toLowerCase()
    return entries.filter((entry) => entry.message.toLowerCase().includes(needle))
  }, [entries, query])

  const counts = useMemo(() => countByFloor(matched), [matched])
  const shown = useMemo(() => matched.filter((entry) => passesFloor(entry.level, floor)), [matched, floor])
  const options = useMemo(() => floorOptions(counts), [counts])

  if (loading) {
    return (
      <Container>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Container>
    )
  }

  // A search box and four chips reading zero can do nothing, so the empty state owns the screen.
  if (entries.length === 0) {
    return (
      <Container>
        <EmptyState icon={FileSearch} title={t("preview.empty.title")} hint={t("preview.empty.hint")} />
      </Container>
    )
  }

  return (
    <Container>
      <View style={styles.head}>
        <View style={[styles.searchBox, { backgroundColor: colors.well }]}>
          <Search size={size.icon.sm} color={colors.textLight} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel={t("preview.search")}
            placeholder={t("preview.search")}
            placeholderTextColor={colors.textLight}
            value={text}
            onChangeText={handleType}
            autoCapitalize="none"
            autoCorrect={false}
            testID="log-search-input"
          />
          {text.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("preview.clear")}
              hitSlop={HIT_SLOP_MD}
              android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.icon.md }}
              onPress={clear}
              testID="clear-search-btn"
            >
              <X size={size.icon.md} color={colors.textLight} />
            </Pressable>
          ) : null}
        </View>

        <ChipGroup accessibilityLabel={t("preview.floor")} options={options} selected={floor} onSelect={setFloor} />

        <Text style={[styles.result, { color: colors.textSecondary }]} numberOfLines={1} testID="log-result-line">
          {resultLine(shown.length, entries.length, fromFile)}
        </Text>
      </View>
      <Divider tight />

      {shown.length === 0 ? (
        <EmptyState icon={FileSearch} title={t("preview.noMatch.title")} hint={t("preview.noMatch.hint")} />
      ) : (
        <View style={styles.listArea}>
          <FlatList
            ref={listRef}
            testID="log-list"
            data={shown}
            inverted
            keyExtractor={(entry) => entry.id}
            renderItem={({ item }) => <LogLine entry={item} />}
            contentContainerStyle={styles.list}
            initialNumToRender={30}
            maxToRenderPerBatch={20}
            windowSize={11}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            showsVerticalScrollIndicator
          />
          {awayFromNewest ? (
            <View style={styles.jump}>
              <MapActionButton
                anchored={false}
                accessibilityRole="button"
                accessibilityLabel={t("preview.jump")}
                onPress={jumpToNewest}
                testID="jump-to-newest-btn"
              >
                <ArrowDown size={size.icon.md} color={colors.text} />
              </MapActionButton>
            </View>
          ) : null}
        </View>
      )}
    </Container>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  head: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.sm
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    minHeight: size.touch,
    gap: space.sm
  },
  searchInput: {
    flex: 1,
    ...fonts.regular,
    fontSize: fontSizes.body,
    padding: 0
  },
  result: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    ...fonts.regular,
    fontVariant: ["tabular-nums"],
    paddingVertical: space.sm
  },
  listArea: {
    flex: 1
  },
  // Inverted, so the top padding is drawn under the newest line and keeps it clear of the jump button.
  list: {
    paddingTop: space.xxl,
    paddingBottom: space.sm
  },
  jump: {
    position: "absolute",
    end: space.lg,
    bottom: space.lg
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xxs
  },
  mono: {
    ...type.mono
  },
  body: {
    flex: 1
  }
})
