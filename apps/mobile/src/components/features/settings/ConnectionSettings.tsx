/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import { StyleSheet, View } from "react-native"
import { Settings } from "../../../types/global"
import NativeLocationService from "../../../services/NativeLocationService"
import { useTranslation } from "../../../i18n/useTranslation"
import { isEndpointAllowed } from "../../../utils/settingsValidation"
import { isTraccarJsonFormat, isOverlandFormat } from "../../../utils/apiPayload"
import { ensureLocalNetworkPermission } from "../../../services/LocationServicePermission"
import { SettingRow } from "../../ui/SettingRow"
import { Toggle } from "../../ui/Toggle"
import { useTimeout } from "../../../hooks/useTimeout"
import { space, TEST_RESULT_DISPLAY_MS } from "../../../constants"
import { logger } from "../../../utils/logger"
import { Button, SectionTitle, Divider, FieldMessage, ListItem, Notice, TextField } from "../../index"
import { showChoice } from "../../../services/modalService"

interface ConnectionSettingsProps {
  settings: Settings
  endpointInput: string
  onEndpointInputChange: (value: string) => void
  onSettingsChange: (newSettings: Settings) => void
  navigation: any
}

export function ConnectionSettings({
  settings,
  endpointInput,
  onEndpointInputChange,
  onSettingsChange,
  navigation
}: ConnectionSettingsProps) {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [testResponse, setTestResponse] = useState<string | null>(null)
  const [testError, setTestError] = useState(false)
  const [endpointPrivate, setEndpointPrivate] = useState(false)
  const timeout = useTimeout()
  const pendingCheck = useRef(0)

  useEffect(() => {
    if (!endpointInput || !endpointInput.startsWith("http://")) {
      setEndpointPrivate(false)
      return
    }
    const id = ++pendingCheck.current
    NativeLocationService.isPrivateEndpoint(endpointInput).then((isPrivate) => {
      if (id === pendingCheck.current) setEndpointPrivate(isPrivate)
    })
  }, [endpointInput])

  const handleOfflineModeChange = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        try {
          const stats = await NativeLocationService.getStats()
          if (stats.queued > 0) {
            const hasEndpoint = !!settings.endpoint
            const buttons = [
              ...(hasEndpoint ? [{ text: t("connection.unsent.sync"), style: "primary" as const }] : []),
              { text: t("connection.unsent.keep"), style: "secondary" as const },
              { text: t("connection.unsent.cancel"), style: "secondary" as const }
            ]
            const choice = await showChoice({
              title: t("connection.unsent.title"),
              message: t("connection.unsent.message", { count: stats.queued }),
              buttons
            })
            const action = hasEndpoint
              ? (["sync", "keep", "cancel"] as const)[choice]
              : (["keep", "cancel"] as const)[choice]
            if (action === "sync") {
              try {
                await NativeLocationService.manualFlush()
              } catch {
                // sync may fail, proceed to offline anyway
              }
              onSettingsChange({ ...settings, isOfflineMode: true })
            } else if (action === "keep") {
              onSettingsChange({ ...settings, isOfflineMode: true })
            }
            return
          }
        } catch {
          // stats fetch failed, proceed normally
        }
      }
      onSettingsChange({ ...settings, isOfflineMode: enabled })
    },
    [settings, onSettingsChange, t]
  )

  const handleTestEndpoint = useCallback(async () => {
    if (!endpointInput) return
    setTesting(true)
    setTestResponse(null)
    setTestError(false)

    try {
      const recentLocation = await NativeLocationService.getMostRecentLocation()
      if (!recentLocation) {
        setTestResponse(t("connection.test.noLocation"))
        setTestError(true)
        return
      }

      const fieldMap = settings.fieldMap
      const payload: Record<string, string | number | boolean> = {}

      // Add custom fields first (matches native buildPayload order)
      for (const { key, value } of settings.customFields) {
        if (key) payload[key] = value
      }

      // Core location fields
      payload[fieldMap.lat] = recentLocation.latitude
      payload[fieldMap.lon] = recentLocation.longitude
      payload[fieldMap.acc] = Math.round(recentLocation.accuracy)

      if (fieldMap.alt) payload[fieldMap.alt] = recentLocation.altitude ?? 0
      if (fieldMap.vel) payload[fieldMap.vel] = recentLocation.speed ?? 0
      if (fieldMap.batt) payload[fieldMap.batt] = recentLocation.battery ?? 0
      if (fieldMap.bs) payload[fieldMap.bs] = recentLocation.batteryStatus ?? 0
      if (fieldMap.bear) payload[fieldMap.bear] = recentLocation.bearing ?? 0
      if (fieldMap.tst) payload[fieldMap.tst] = Math.floor(Date.now() / 1000)

      const isPrivate = await NativeLocationService.isPrivateEndpoint(endpointInput)
      if (isPrivate) {
        const granted = await ensureLocalNetworkPermission()
        if (!granted) {
          setTestResponse(t("connection.test.localNetworkDenied"))
          setTestError(true)
          return
        }
      }

      const method = settings.httpMethod ?? "POST"
      const isTraccarJson = isTraccarJsonFormat(settings.apiTemplate, method)
      const isOverland = isOverlandFormat(settings.apiTemplate, settings.dawarichMode ?? "single")
      const apiFormat = isTraccarJson ? "traccar_json" : isOverland ? "overland_batch" : ""

      const customFields: Record<string, string> = {}
      for (const { key, value } of settings.customFields) {
        if (key) customFields[key] = value
      }

      const result = await NativeLocationService.testEndpoint({
        endpoint: endpointInput,
        method,
        apiFormat,
        payload,
        customFields
      })

      if (result.ok) {
        setTestResponse(t("connection.test.success"))
        onSettingsChange({ ...settings, endpoint: endpointInput })
      } else {
        logger.warn("[ConnectionSettings] Test failed:", result.status, result.errorMessage)
        setTestResponse(result.errorMessage || t("connection.test.status", { status: result.status }))
        setTestError(true)
      }
    } catch (err: any) {
      const msg = err?.message || t("connection.test.unknownError")
      logger.warn("[ConnectionSettings] Test failed:", err?.name, msg)
      setTestResponse(t("connection.test.failed", { message: msg }))
      setTestError(true)
    } finally {
      setTesting(false)
      timeout.set(() => setTestResponse(null), TEST_RESULT_DISPLAY_MS)
    }
  }, [endpointInput, settings, onSettingsChange, timeout, t])

  const testDisabled = !endpointInput || !isEndpointAllowed(endpointInput)

  return (
    <View>
      <SectionTitle first>{t("connection.server")}</SectionTitle>

      <SettingRow label={t("connection.offlineMode")} hint={t("connection.offlineMode.hint")}>
        <Toggle
          value={settings.isOfflineMode}
          onValueChange={handleOfflineModeChange}
          accessibilityLabel={t("connection.offlineMode")}
        />
      </SettingRow>

      {!settings.isOfflineMode && (
        <>
          <Divider tight />

          <View style={styles.form}>
            <TextField
              label={t("connection.endpoint")}
              mono
              value={endpointInput}
              onChangeText={onEndpointInputChange}
              placeholder="https://your-server.com/api/locations"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            {!endpointInput && <FieldMessage variant="warning">{t("connection.endpoint.none")}</FieldMessage>}

            {endpointInput.startsWith("http://") && !endpointPrivate && (
              <FieldMessage variant="warning">{t("connection.endpoint.httpPublic")}</FieldMessage>
            )}

            {endpointInput.includes("%") && <FieldMessage>{t("connection.endpoint.variables")}</FieldMessage>}

            <Button
              testID="test-connection-btn"
              style={styles.testButton}
              disabled={testDisabled}
              loading={testing}
              onPress={handleTestEndpoint}
              title={t("connection.test")}
            />
          </View>

          {testResponse && (
            <Notice testID="connection-test-result" variant={testError ? "error" : "success"} title={testResponse} />
          )}

          <ListItem
            label={t("connection.auth")}
            sub={t("connection.auth.sub")}
            onPress={() => navigation.navigate("Auth Settings")}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    paddingVertical: space.lg
  },
  testButton: {
    marginTop: space.lg
  }
})
