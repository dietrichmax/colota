/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useRef } from "react"
import { StyleSheet, View, Text, TouchableOpacity } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { useTheme } from "../../../hooks/useTheme"
import { useTracking } from "../../../contexts/TrackingProvider"
import { ServerStatus, ServerConnectionProps } from "../../../types/global"
import { fonts } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { SERVER_TIMEOUT, SERVER_CHECK_INTERVAL } from "../../../constants"

export function ServerConnection({ endpoint, navigation }: ServerConnectionProps) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const isOffline = settings.isOfflineMode

  const [serverStatus, setServerStatus] = useState<ServerStatus | "offline" | "deviceOffline" | null>(null)

  const hasChecked = useRef(false)

  const checkServer = useCallback(async () => {
    if (isOffline) {
      setServerStatus("offline")
      hasChecked.current = true
      return
    }

    const networkAvailable = await NativeLocationService.isNetworkAvailable()
    if (!networkAvailable) {
      setServerStatus("deviceOffline")
      hasChecked.current = true
      return
    }

    if (!endpoint) {
      setServerStatus("notConfigured")
      hasChecked.current = true
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SERVER_TIMEOUT)

    try {
      let authHeaders: Record<string, string> = {}
      try {
        authHeaders = await NativeLocationService.getAuthHeaders()
      } catch {
        // proceed without auth headers
      }

      const healthUrl = endpoint.replace(/\/api\/locations$/, "/health")

      let response = await fetch(healthUrl, {
        method: "HEAD",
        signal: controller.signal,
        headers: authHeaders
      })

      if (response.status === 404 || response.status === 405) {
        response = await fetch(endpoint, {
          method: "HEAD",
          signal: controller.signal,
          headers: authHeaders
        })
      }

      if (!response.ok) {
        const match = endpoint.match(/^(https?:\/\/[^/]+)/)
        if (match) {
          response = await fetch(match[1], {
            method: "GET",
            signal: controller.signal,
            headers: authHeaders
          })
        }
      }

      setServerStatus(response.ok ? "connected" : "error")
      hasChecked.current = true
    } catch {
      setServerStatus("error")
      hasChecked.current = true
    } finally {
      clearTimeout(timeoutId)
    }
  }, [endpoint, isOffline])

  useFocusEffect(
    useCallback(() => {
      checkServer()
      const timer = setInterval(checkServer, SERVER_CHECK_INTERVAL)
      return () => clearInterval(timer)
    }, [checkServer])
  )

  const displayUrl = endpoint ? endpoint.replace(/^https?:\/\//, "").split("/")[0] : ""

  const config = useMemo(() => {
    const statusMap = {
      connected: { color: colors.success, label: "Connected" },
      error: { color: colors.error, label: "Unreachable" },
      notConfigured: { color: colors.warning, label: "No endpoint" },
      deviceOffline: { color: colors.textSecondary, label: "Device offline" },
      offline: { color: colors.textSecondary, label: "Offline" },
      loading: { color: colors.textLight, label: "Checking" }
    }

    if (serverStatus === null) return statusMap.loading
    if (isOffline) return statusMap.offline
    if (serverStatus === "deviceOffline") return statusMap.deviceOffline
    return statusMap[serverStatus as ServerStatus] || statusMap.error
  }, [serverStatus, colors, isOffline])

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigation.navigate("Settings")}
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.host, { color: colors.text }]} numberOfLines={1}>
        {displayUrl || "Server"}
      </Text>
      <Text style={[styles.status, { color: config.color }]}>{config.label}</Text>
      <ChevronRight size={16} color={colors.textLight} />
    </TouchableOpacity>
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
