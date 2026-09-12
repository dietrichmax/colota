/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback } from "react"
import { StyleSheet, View, Text, Pressable, DeviceEventEmitter } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { useTheme } from "../../../hooks/useTheme"
import { useTracking } from "../../../contexts/TrackingProvider"
import { ConnectionStatusProps, DatabaseStats } from "../../../types/global"
import { fontSizes, fonts } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { describeServer, endpointHost, type ServerTone } from "../../../utils/serverState"
import { formatCount } from "../../../utils/format"
import { radius } from "@colota/shared"

export function ConnectionStatus({ endpoint, navigation }: ConnectionStatusProps) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const isOffline = settings.isOfflineMode

  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [deviceOnline, setDeviceOnline] = useState(true)

  useFocusEffect(
    useCallback(() => {
      // A stale run (e.g. one started before the endpoint loaded) must not overwrite a newer status.
      let cancelled = false

      const refresh = async () => {
        if (isOffline) return
        const networkAvailable = await NativeLocationService.isNetworkAvailable()
        if (cancelled) return
        setDeviceOnline(networkAvailable)
        if (!endpoint) return
        try {
          const next = await NativeLocationService.getStats()
          if (!cancelled) setStats(next)
        } catch {
          // getStats is a local DB read; a failure here says nothing about the server.
        }
      }

      refresh()
      // The queue grows on a fix and drains or fails on a sync, so those events are exactly when the row changes.
      const subs = ["onSyncError", "onSyncProgress", "onLocationUpdate"].map((event) =>
        DeviceEventEmitter.addListener(event, refresh)
      )
      return () => {
        cancelled = true
        subs.forEach((sub) => sub.remove())
      }
    }, [endpoint, isOffline])
  )

  const tone = (t: ServerTone) =>
    t === "success"
      ? colors.success
      : t === "error"
        ? colors.error
        : t === "warning"
          ? colors.warning
          : t === "light"
            ? colors.textLight
            : colors.textSecondary

  const known = isOffline || !endpoint || !deviceOnline || stats !== null
  const server = describeServer({
    offline: isOffline,
    endpoint: endpoint ?? "",
    deviceOnline,
    queued: stats?.queued ?? 0,
    today: stats?.today ?? 0,
    lastSyncTime: stats?.lastSyncTime ?? 0,
    lastSyncError: stats?.lastSyncError ?? ""
  })
  const word = known ? server.word : "Checking"
  const dotColor = known ? tone(server.tone) : colors.textLight

  const hostLabel = isOffline ? "Offline mode" : endpoint ? endpointHost(endpoint) : "Server"
  const queued = stats?.queued ?? 0
  const queueLabel = queued > 0 ? `${formatCount(queued)} queued` : ""
  const spokenStatus = [word, queueLabel].filter(Boolean).join(" · ")
  // A healthy server says nothing; the word is for a screen reader, which cannot see the dot.
  const statusLabel = known && server.tone === "success" ? queueLabel : spokenStatus

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isOffline ? hostLabel : `${hostLabel}, ${spokenStatus}`}
      onPress={() => navigation.navigate("Connection")}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      style={styles.row}
    >
      <View style={styles.glyph}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      </View>
      <Text style={[styles.host, { color: colors.text }]} numberOfLines={1}>
        {hostLabel}
      </Text>
      {/* The endpoint can answer while the backlog grows, held by the sync condition or a 429, so the queue shows on its own. */}
      {!isOffline && statusLabel !== "" && (
        <Text style={[styles.status, { color: colors.textSecondary }]} numberOfLines={1}>
          {statusLabel}
        </Text>
      )}
      <ChevronRight size={size.icon.sm} color={colors.textLight} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    minHeight: size.row,
    paddingVertical: space.md,
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg
  },
  glyph: {
    width: size.icon.md,
    alignItems: "center"
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill
  },
  host: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: fontSizes.body,
    ...fonts.medium
  },
  status: {
    flexShrink: 1,
    fontSize: fontSizes.caption,
    ...fonts.medium
  }
})
