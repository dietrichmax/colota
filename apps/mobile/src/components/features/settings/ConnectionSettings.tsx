/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import { Text, StyleSheet, View } from "react-native"
import { CircleCheckBig } from "lucide-react-native"
import { Settings, ThemeColors } from "../../../types/global"
import NativeLocationService from "../../../services/NativeLocationService"
import { isEndpointAllowed } from "../../../utils/settingsValidation"
import { isTraccarJsonFormat, isOverlandFormat } from "../../../utils/apiPayload"
import { ensureLocalNetworkPermission } from "../../../services/LocationServicePermission"
import { fontSizes, fonts } from "../../../styles/typography"
import { SettingRow } from "../../ui/SettingRow"
import { useTimeout } from "../../../hooks/useTimeout"
import { TEST_RESULT_DISPLAY_MS, size, space } from "../../../constants"
import { logger } from "../../../utils/logger"
import { Button, Card, Divider, FieldMessage, TextField, Toggle, ListItem } from "../../index"
import { showChoice } from "../../../services/modalService"
import { radius } from "@colota/shared"

interface ConnectionSettingsProps {
  settings: Settings
  endpointInput: string
  onEndpointInputChange: (value: string) => void
  onSettingsChange: (newSettings: Settings) => void
  colors: ThemeColors
  navigation: any
}

export function ConnectionSettings({
  settings,
  endpointInput,
  onEndpointInputChange,
  onSettingsChange,
  colors,
  navigation
}: ConnectionSettingsProps) {
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
              ...(hasEndpoint ? [{ text: "Sync first", style: "primary" as const }] : []),
              { text: "Keep in queue", style: "secondary" as const },
              { text: "Cancel", style: "secondary" as const }
            ]
            const choice = await showChoice({
              title: "Unsent locations",
              message: `You have ${stats.queued} locations waiting to sync. What would you like to do?`,
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
    [settings, onSettingsChange]
  )

  const canTestEndpoint = Boolean(endpointInput) && isEndpointAllowed(endpointInput)

  const handleTestEndpoint = useCallback(async () => {
    // Guards here as well as on the button: disabled stops the press, this stops a caller.
    if (!canTestEndpoint) return
    setTesting(true)
    setTestResponse(null)
    setTestError(false)

    try {
      const recentLocation = await NativeLocationService.getMostRecentLocation()
      if (!recentLocation) {
        setTestResponse("No location data yet. Start tracking to collect a test point, then try again.")
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
          setTestResponse("Local network permission required to reach this server")
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
        setTestResponse("Connection successful")
        onSettingsChange({ ...settings, endpoint: endpointInput })
      } else {
        logger.warn("[ConnectionSettings] Test failed:", result.status, result.errorMessage)
        setTestResponse(result.errorMessage || `Server returned ${result.status}`)
        setTestError(true)
      }
    } catch (err: any) {
      const msg = err?.message || "Unknown error"
      logger.warn("[ConnectionSettings] Test failed:", err?.name, msg)
      setTestResponse(`Connection failed: ${msg}`)
      setTestError(true)
    } finally {
      setTesting(false)
      timeout.set(() => setTestResponse(null), TEST_RESULT_DISPLAY_MS)
    }
  }, [canTestEndpoint, endpointInput, settings, onSettingsChange, timeout])

  return (
    <View style={styles.section}>
      <Card>
        <SettingRow label="Offline mode" hint="Save locally, no network sync">
          <Toggle
            accessibilityLabel="Offline mode"
            value={settings.isOfflineMode}
            onValueChange={handleOfflineModeChange}
          />
        </SettingRow>

        {!settings.isOfflineMode && (
          <>
            <Divider />

            <View style={styles.inputGroup}>
              <View style={styles.inputHeader}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Server endpoint</Text>
                {endpointInput && (
                  <View
                    style={[
                      styles.protocolBadge,
                      {
                        backgroundColor: endpointInput.startsWith("https://")
                          ? colors.well
                          : colors.warning + "20"
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.protocolText,
                        {
                          color: endpointInput.startsWith("https://") ? colors.textSecondary : colors.warning
                        }
                      ]}
                    >
                      {endpointInput.startsWith("https://") ? "HTTPS" : "HTTP"}
                    </Text>
                  </View>
                )}
              </View>

              <TextField
                accessibilityLabel="Server endpoint"
                testID="endpoint-input"
                mono
                value={endpointInput}
                onChangeText={onEndpointInputChange}
                placeholder="https://your-server.com/api/locations"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              {!endpointInput && (
                <FieldMessage variant="warning">No server configured. Locations are saved locally</FieldMessage>
              )}

              {endpointInput.startsWith("http://") && !endpointPrivate && (
                <FieldMessage variant="warning">HTTP only allowed for private IPs / localhost</FieldMessage>
              )}

              {endpointInput.includes("%") && (
                <FieldMessage>Variables: %DATE, %YEAR, %MONTH, %DAY, %TIMESTAMP</FieldMessage>
              )}
            </View>

            <Button
              style={styles.testButton}
              disabled={!canTestEndpoint}
              onPress={handleTestEndpoint}
              title={testing ? "Testing..." : "Test connection"}
            />

            {testResponse && (
              <View
                style={[
                  styles.responseBox,
                  {
                    borderColor: testError ? colors.error : colors.border,
                    backgroundColor: testError ? colors.error + "15" : colors.well
                  }
                ]}
              >
                {!testError && <CircleCheckBig size={size.icon.sm} color={colors.success} />}
                <Text style={[styles.responseText, { color: testError ? colors.error : colors.text }]}>
                  {testResponse}
                </Text>
              </View>
            )}

            <Divider />

            <ListItem
              testID="nav-auth-settings"
              label="Authentication & headers"
              sub="Basic auth, bearer tokens, custom headers"
              onPress={() => navigation.navigate("Auth Settings")}
            />
          </>
        )}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: space.xl
  },
  inputGroup: {
    marginBottom: space.md
  },
  inputHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  inputLabel: {
    fontSize: fontSizes.input,
    ...fonts.semiBold
  },
  protocolBadge: {
    paddingHorizontal: 10,
    paddingVertical: space.xs,
    borderRadius: radius.md
  },
  protocolText: {
    fontSize: fontSizes.small,
    ...fonts.bold
  },
  testButton: {
    marginTop: space.md
  },
  responseBox: {
    marginTop: space.md,
    padding: 14,
    borderWidth: 1.5,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm
  },
  responseText: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
})
