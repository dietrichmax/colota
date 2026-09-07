/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo } from "react"
import { StyleSheet, View, Text, Pressable, DeviceEventEmitter } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { useTheme } from "../../../hooks/useTheme"
import { useTracking } from "../../../contexts/TrackingProvider"
import { ServerStatus, ConnectionStatusProps } from "../../../types/global"
import { fontSizes, fonts } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { radius } from "@colota/shared"

export function ConnectionStatus({ endpoint, navigation }: ConnectionStatusProps) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const isOffline = settings.isOfflineMode

  const [serverStatus, setServerStatus] = useState<ServerStatus | "offline" | "deviceOffline" | null>(null)
  const [queued, setQueued] = useState(0)

  useFocusEffect(
    useCallback(() => {
      // A stale run (e.g. one started before the endpoint loaded) must not overwrite a newer status.
      let cancelled = false

      const refresh = async () => {
        if (isOffline) {
          setServerStatus("offline")
          return
        }

        const networkAvailable = await NativeLocationService.isNetworkAvailable()
        if (cancelled) return
        if (!networkAvailable) {
          setServerStatus("deviceOffline")
          return
        }

        if (!endpoint) {
          setServerStatus("notConfigured")
          return
        }

        try {
          const stats = await NativeLocationService.getStats()
          if (cancelled) return
          setQueued(stats.queued)
          // Empty queue plus a prior successful send (sent = retained synced rows) means caught up.
          if (stats.queued === 0 && stats.sent > 0) {
            setServerStatus("connected")
          }
        } catch {
          // getStats is a local DB read; a failure here says nothing about the server.
        }
      }

      refresh()
      // The queue grows on a fix and drains on a sync, so those two events are exactly when the row changes.
      const subs = [
        DeviceEventEmitter.addListener("onSyncError", () => setServerStatus("error")),
        DeviceEventEmitter.addListener("onSyncProgress", refresh),
        DeviceEventEmitter.addListener("onLocationUpdate", refresh)
      ]
      return () => {
        cancelled = true
        subs.forEach((sub) => sub.remove())
      }
    }, [endpoint, isOffline])
  )

  const displayUrl = endpoint ? endpoint.replace(/^https?:\/\//, "").split("/")[0] : ""

  const config = useMemo(() => {
    const statusMap = {
      connected: { color: colors.success, label: "Connected" },
      error: { color: colors.error, label: "Unreachable" },
      notConfigured: { color: colors.warning, label: "No endpoint" },
      deviceOffline: { color: colors.textSecondary, label: "Device offline" },
      offline: { color: colors.textSecondary, label: "Offline mode" },
      loading: { color: colors.textLight, label: "Checking" }
    }

    if (serverStatus === null) return statusMap.loading
    if (isOffline) return statusMap.offline
    if (serverStatus === "deviceOffline") return statusMap.deviceOffline
    return statusMap[serverStatus as ServerStatus] || statusMap.error
  }, [serverStatus, colors, isOffline])

  const hostLabel = isOffline ? "Offline mode" : displayUrl || "Server"
  const queueLabel = queued > 0 ? `${queued.toLocaleString()} queued` : ""
  const spokenStatus = [config.label, queueLabel].filter(Boolean).join(" · ")
  // A healthy server says nothing; the word is for a screen reader, which cannot see the dot.
  const statusLabel = serverStatus === "connected" ? queueLabel : spokenStatus

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isOffline ? hostLabel : `${hostLabel}, ${spokenStatus}`}
      onPress={() => navigation.navigate("Connection")}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      style={styles.row}
    >
      <View style={styles.glyph}>
        <View style={[styles.dot, { backgroundColor: config.color }]} />
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
