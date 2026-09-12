/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback } from "react"
import { StyleSheet, ScrollView, DeviceEventEmitter } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { API_TEMPLATES, AuthConfig, ClientCertInfoResult, DatabaseStats, ScreenProps, Settings } from "../types/global"
import { useAutoSave } from "../hooks/useAutoSave"
import { useTracking } from "../contexts/TrackingProvider"
import { FloatingSaveIndicator } from "../components/ui/FloatingSaveIndicator"
import { Container } from "../components"
import { ConnectionSettings } from "../components/features/settings/ConnectionSettings"
import NativeLocationService from "../services/NativeLocationService"
import { describeServer } from "../utils/serverState"
import { describeCertificate } from "../utils/certificateState"
import { logger } from "../utils/logger"
import { space } from "../constants"

const AUTH_WORDS = { none: "None", basic: "Basic auth", bearer: "Bearer token" } as const

export function authSummary(auth: AuthConfig | null): string {
  if (!auth) return ""
  const headers = Object.keys(auth.customHeaders).length
  return headers > 0
    ? `${AUTH_WORDS[auth.authType]} · ${headers} ${headers === 1 ? "header" : "headers"}`
    : AUTH_WORDS[auth.authType]
}

export function ConnectionScreen({ navigation }: ScreenProps) {
  const { settings, setSettings, updateSettingsLocal, restartTracking } = useTracking()
  const { saving, message: saveMessage, isError: saveIsError, immediateSaveAndRestart } = useAutoSave()

  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [deviceOnline, setDeviceOnline] = useState(true)
  const [hasFix, setHasFix] = useState(false)
  const [auth, setAuth] = useState<AuthConfig | null>(null)
  const [certInfo, setCertInfo] = useState<ClientCertInfoResult | null>(null)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      const refresh = async () => {
        try {
          const [nextStats, online, fix, nextAuth, cert] = await Promise.all([
            NativeLocationService.getStats(),
            NativeLocationService.isNetworkAvailable(),
            NativeLocationService.getMostRecentLocation(),
            NativeLocationService.getAuthConfig(),
            NativeLocationService.getClientCertInfo()
          ])
          if (cancelled) return
          setStats(nextStats)
          setDeviceOnline(online)
          setHasFix(fix !== null)
          setAuth(nextAuth)
          setCertInfo(cert)
        } catch (err) {
          logger.error("[ConnectionScreen] Failed to read the server state:", err)
        }
      }
      refresh()
      const subs = ["onSyncProgress", "onSyncError", "onLocationUpdate"].map((event) =>
        DeviceEventEmitter.addListener(event, refresh)
      )
      return () => {
        cancelled = true
        subs.forEach((sub) => sub.remove())
      }
    }, [])
  )

  const handleImmediateSave = useCallback(
    (newSettings: Settings) => {
      immediateSaveAndRestart(
        () => setSettings(newSettings),
        () => restartTracking(newSettings)
      )
    },
    [setSettings, immediateSaveAndRestart, restartTracking]
  )

  const certificate = describeCertificate(certInfo)
  const server = describeServer({
    offline: settings.isOfflineMode,
    endpoint: settings.endpoint,
    deviceOnline,
    queued: stats?.queued ?? 0,
    today: stats?.today ?? 0,
    lastSyncTime: stats?.lastSyncTime ?? 0,
    lastSyncError: stats?.lastSyncError ?? "",
    certificate
  })
  const template = settings.apiTemplate === "custom" ? "Custom" : API_TEMPLATES[settings.apiTemplate].label
  const requestSummary = `${template} · ${settings.httpMethod ?? "POST"}`

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ConnectionSettings
          settings={settings}
          onSettingsLocal={updateSettingsLocal}
          onSettingsChange={handleImmediateSave}
          server={server}
          hasFix={hasFix}
          requestSummary={requestSummary}
          authSummary={authSummary(auth)}
          certificateSummary={certificate.rowSub}
          navigation={navigation}
        />
      </ScrollView>

      <FloatingSaveIndicator saving={saving} message={saveMessage} isError={saveIsError} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  }
})
