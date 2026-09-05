/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo } from "react"
import { DeviceEventEmitter } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { useTheme } from "../../../hooks/useTheme"
import { useTracking } from "../../../contexts/TrackingProvider"
import { useTranslation } from "../../../i18n/useTranslation"
import { ServerStatus, ConnectionStatusProps } from "../../../types/global"
import { formatTime } from "../../../utils/geo"
import { ListItem } from "../../ui/ListItem"
import NativeLocationService from "../../../services/NativeLocationService"

type Resolved = { status: ServerStatus | "offline" | "deviceOffline"; at: number }

export function ConnectionStatus({ endpoint, navigation }: ConnectionStatusProps) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const { t } = useTranslation()
  const isOffline = settings.isOfflineMode

  const [resolved, setResolved] = useState<Resolved | null>(null)

  useFocusEffect(
    useCallback(() => {
      // A stale run (e.g. one started before the endpoint loaded) must not overwrite a newer status.
      let cancelled = false

      const settle = (status: Resolved["status"]) => setResolved({ status, at: Math.round(Date.now() / 1000) })

      const refresh = async () => {
        if (isOffline) {
          settle("offline")
          return
        }

        const networkAvailable = await NativeLocationService.isNetworkAvailable()
        if (cancelled) return
        if (!networkAvailable) {
          settle("deviceOffline")
          return
        }

        if (!endpoint) {
          settle("notConfigured")
          return
        }

        try {
          const stats = await NativeLocationService.getStats()
          if (cancelled) return
          // Empty queue plus a prior successful send (sent = retained synced rows) means caught up.
          if (stats.queued === 0 && stats.sent > 0) {
            settle("connected")
          }
        } catch {
          // getStats is a local DB read; a failure here says nothing about the server.
        }
      }

      refresh()
      const sub = DeviceEventEmitter.addListener("onSyncError", () => settle("error"))
      return () => {
        cancelled = true
        sub.remove()
      }
    }, [endpoint, isOffline])
  )

  const displayUrl = endpoint ? endpoint.replace(/^https?:\/\//, "").split("/")[0] : ""

  const config = useMemo(() => {
    const statusMap = {
      connected: { color: colors.success, label: t("dashboard.server.connected") },
      error: { color: colors.error, label: t("dashboard.server.unreachable") },
      notConfigured: { color: colors.warning, label: t("dashboard.server.noEndpoint") },
      deviceOffline: { color: colors.textSecondary, label: t("dashboard.server.deviceOffline") },
      offline: { color: colors.textSecondary, label: t("dashboard.server.offlineMode") },
      loading: { color: colors.textLight, label: t("dashboard.server.checking") }
    }

    if (resolved === null) return statusMap.loading
    if (isOffline) return statusMap.offline
    if (resolved.status === "deviceOffline") return statusMap.deviceOffline
    return statusMap[resolved.status as ServerStatus] || statusMap.error
  }, [resolved, colors, isOffline, t])

  // The clock only says something where a real exchange settled the status.
  const stamped = resolved !== null && (resolved.status === "connected" || resolved.status === "error")
  const sub = stamped
    ? t("dashboard.server.sub", { status: config.label, time: formatTime(resolved.at) })
    : config.label

  return (
    <ListItem
      testID="connection-status"
      dot={config.color}
      label={isOffline ? t("dashboard.server.offlineMode") : displayUrl || t("dashboard.server")}
      sub={isOffline ? undefined : sub}
      onPress={() => navigation.navigate("Connection")}
    />
  )
}
