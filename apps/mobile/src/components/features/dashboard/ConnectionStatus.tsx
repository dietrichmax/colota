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
import { fonts } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { size } from "../../../constants"

export function ConnectionStatus({ endpoint, navigation }: ConnectionStatusProps) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const isOffline = settings.isOfflineMode

  const [serverStatus, setServerStatus] = useState<ServerStatus | "offline" | "deviceOffline" | null>(null)

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
          // Empty queue plus a prior successful send (sent = retained synced rows) means caught up.
          if (stats.queued === 0 && stats.sent > 0) {
            setServerStatus("connected")
          }
        } catch {
          // getStats is a local DB read; a failure here says nothing about the server.
        }
      }

      refresh()
      const sub = DeviceEventEmitter.addListener("onSyncError", () => setServerStatus("error"))
      return () => {
        cancelled = true
        sub.remove()
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
      offline: { color: colors.textSecondary, label: "Offline Mode" },
      loading: { color: colors.textLight, label: "Checking" }
    }

    if (serverStatus === null) return statusMap.loading
    if (isOffline) return statusMap.offline
    if (serverStatus === "deviceOffline") return statusMap.deviceOffline
    return statusMap[serverStatus as ServerStatus] || statusMap.error
  }, [serverStatus, colors, isOffline])

  return (
    <Pressable
      onPress={() => navigation.navigate("Connection")}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: colors.pressedOpacity }
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.host, { color: colors.text }]} numberOfLines={1}>
        {isOffline ? "Offline Mode" : displayUrl || "Server"}
      </Text>
      {!isOffline && <Text style={[styles.status, { color: config.color }]}>{config.label}</Text>}
      <ChevronRight size={size.icon.sm} color={colors.textLight} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 22
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12
  },
  host: {
    flex: 1,
    fontSize: 14,
    ...fonts.medium
  },
  status: {
    fontSize: 12,
    ...fonts.medium,
    marginRight: 8
  }
})
