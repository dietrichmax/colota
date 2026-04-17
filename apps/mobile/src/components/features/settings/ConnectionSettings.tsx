/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import { Text, StyleSheet, TextInput, Switch, View, Pressable } from "react-native"
import { CheckCircle, ChevronRight } from "lucide-react-native"
import { Settings, ThemeColors } from "../../../types/global"
import NativeLocationService from "../../../services/NativeLocationService"
import { isEndpointAllowed } from "../../../utils/settingsValidation"
import { buildTraccarJsonPayload, isTraccarJsonFormat } from "../../../utils/apiPayload"
import { ensureLocalNetworkPermission } from "../../../services/LocationServicePermission"
import { fonts } from "../../../styles/typography"
import { SettingRow } from "../../ui/SettingRow"
import { useTimeout } from "../../../hooks/useTimeout"
import { CONNECTION_TEST_TIMEOUT, TEST_RESULT_DISPLAY_MS } from "../../../constants"
import { logger } from "../../../utils/logger"
import { Button, Card, SectionTitle, Divider } from "../../index"
import { showChoice } from "../../../services/modalService"

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
              ...(hasEndpoint ? [{ text: "Sync First", style: "primary" as const }] : []),
              { text: "Keep in Queue", style: "secondary" as const },
              { text: "Delete Queue", style: "destructive" as const },
              { text: "Cancel", style: "secondary" as const }
            ]
            const choice = await showChoice({
              title: "Unsent Locations",
              message: `You have ${stats.queued} locations waiting to sync. What would you like to do?`,
              buttons
            })
            // Normalize index: with endpoint [Sync, Keep, Delete, Cancel], without [Keep, Delete, Cancel]
            const action = hasEndpoint
              ? (["sync", "keep", "delete", "cancel"] as const)[choice]
              : (["keep", "delete", "cancel"] as const)[choice]
            if (action === "sync") {
              try {
                await NativeLocationService.manualFlush()
              } catch {
                // sync may fail, proceed to offline anyway
              }
              onSettingsChange({ ...settings, isOfflineMode: true })
            } else if (action === "keep") {
              onSettingsChange({ ...settings, isOfflineMode: true })
            } else if (action === "delete") {
              await NativeLocationService.clearQueue()
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

  const handleTestEndpoint = useCallback(async () => {
    if (!endpointInput) return
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

      // Optional fields with real values from the location
      if (fieldMap.alt) payload[fieldMap.alt] = recentLocation.altitude ?? 0
      if (fieldMap.vel) payload[fieldMap.vel] = recentLocation.speed ?? 0
      if (fieldMap.batt) payload[fieldMap.batt] = recentLocation.battery ?? 0
      if (fieldMap.bs) payload[fieldMap.bs] = recentLocation.batteryStatus ?? 0
      if (fieldMap.bear) payload[fieldMap.bear] = recentLocation.bearing ?? 0
      if (fieldMap.tst) payload[fieldMap.tst] = Math.floor(Date.now() / 1000)

      const protocolAllowed = await NativeLocationService.isValidEndpointProtocol(endpointInput)
      if (!protocolAllowed) {
        setTestResponse("HTTPS is required for public endpoints. HTTP is only allowed for private/local addresses.")
        setTestError(true)
        return
      }

      const isPrivate = await NativeLocationService.isPrivateEndpoint(endpointInput)
      if (isPrivate) {
        const granted = await ensureLocalNetworkPermission()
        if (!granted) {
          setTestResponse("Local network permission required to reach this server")
          setTestError(true)
          return
        }
      }

      let authHeaders: Record<string, string> = {}
      try {
        authHeaders = await NativeLocationService.getAuthHeaders()
      } catch {
        // proceed without auth headers
      }

      const method = settings.httpMethod ?? "POST"
      const isTraccarJson = isTraccarJsonFormat(settings.apiTemplate, method)
      const body = isTraccarJson
        ? buildTraccarJsonPayload({
            latitude: recentLocation.latitude,
            longitude: recentLocation.longitude,
            accuracy: recentLocation.accuracy,
            altitude: recentLocation.altitude ?? 0,
            speed: recentLocation.speed ?? 0,
            heading: recentLocation.bearing ?? 0,
            batteryLevel: (recentLocation.battery ?? 0) / 100,
            isCharging: false,
            deviceId: settings.customFields.find((f) => f.key === "device_id")?.value ?? "colota"
          })
        : payload
      const params = new URLSearchParams(Object.entries(payload).map(([k, v]) => [k, String(v)]))
      const url =
        method === "GET" ? `${endpointInput}${endpointInput.includes("?") ? "&" : "?"}${params}` : endpointInput
      const controller = new AbortController()
      timeout.set(() => controller.abort(), CONNECTION_TEST_TIMEOUT)
      const response = await fetch(url, {
        method,
        headers: method === "GET" ? authHeaders : { "Content-Type": "application/json", ...authHeaders },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      })
      timeout.clear()

      if (response.ok) {
        setTestResponse("Connection successful")
        onSettingsChange({ ...settings, endpoint: endpointInput })
      } else {
        logger.warn("[ConnectionSettings] Test failed: HTTP", response.status)
        setTestResponse(`Server returned ${response.status} ${response.statusText || ""}`.trim())
        setTestError(true)
      }
    } catch (err: any) {
      const msg = err.message || ""
      let userMessage: string
      if (err.name === "AbortError") {
        userMessage = `Connection timed out - server did not respond within ${CONNECTION_TEST_TIMEOUT / 1000}s`
      } else if (msg.toLowerCase().includes("network request failed")) {
        userMessage = "Network request failed - check your URL, connection, and SSL certificate"
      } else {
        userMessage = `Connection failed: ${msg || "Unknown error"}`
      }
      logger.warn("[ConnectionSettings] Test failed:", err.name, msg)
      setTestResponse(userMessage)
      setTestError(true)
    } finally {
      setTesting(false)
      timeout.set(() => setTestResponse(null), TEST_RESULT_DISPLAY_MS)
    }
  }, [endpointInput, settings, onSettingsChange, timeout])

  return (
    <View style={styles.section}>
      <SectionTitle>Connection</SectionTitle>
      <Card>
        <SettingRow label="Offline Mode" hint="Save locally, no network sync">
          <Switch
            value={settings.isOfflineMode}
            onValueChange={handleOfflineModeChange}
            trackColor={{
              false: colors.border,
              true: colors.primary + "80"
            }}
            thumbColor={settings.isOfflineMode ? colors.primary : colors.border}
          />
        </SettingRow>

        {!settings.isOfflineMode && (
          <>
            <Divider />

            <View style={styles.inputGroup}>
              <View style={styles.inputHeader}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Server Endpoint</Text>
                {endpointInput && (
                  <View
                    style={[
                      styles.protocolBadge,
                      {
                        backgroundColor: endpointInput.startsWith("https://")
                          ? colors.success + "20"
                          : colors.warning + "20"
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.protocolText,
                        {
                          color: endpointInput.startsWith("https://") ? colors.success : colors.warning
                        }
                      ]}
                    >
                      {endpointInput.startsWith("https://") ? "HTTPS" : "HTTP"}
                    </Text>
                  </View>
                )}
              </View>

              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background
                  }
                ]}
                value={endpointInput}
                onChangeText={onEndpointInputChange}
                placeholder="https://your-server.com/api/locations"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              {!endpointInput && (
                <Text style={[styles.endpointHint, { color: colors.warning }]}>
                  No server configured. Locations are saved locally
                </Text>
              )}

              {endpointInput.startsWith("http://") && !endpointPrivate && (
                <Text style={[styles.httpWarning, { color: colors.warning }]}>
                  HTTP only allowed for private IPs / localhost
                </Text>
              )}

              {endpointInput.includes("%") && (
                <Text style={[styles.endpointHint, { color: colors.textSecondary }]}>
                  Variables: %DATE, %YEAR, %MONTH, %DAY, %TIMESTAMP
                </Text>
              )}
            </View>

            <Button
              style={[
                styles.testButton,
                (!endpointInput || !isEndpointAllowed(endpointInput)) && styles.disabledButton
              ]}
              onPress={() => {
                if (!endpointInput || !isEndpointAllowed(endpointInput)) return
                handleTestEndpoint()
              }}
              title={testing ? "Testing..." : "Test Connection"}
            />

            {testResponse && (
              <View
                style={[
                  styles.responseBox,
                  {
                    borderColor: testError ? colors.error : colors.success,
                    backgroundColor: (testError ? colors.error : colors.success) + "15"
                  }
                ]}
              >
                {!testError && <CheckCircle size={16} color={colors.success} />}
                <Text style={[styles.responseText, { color: testError ? colors.error : colors.success }]}>
                  {testResponse}
                </Text>
              </View>
            )}

            <Divider />

            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={() => navigation.navigate("Auth Settings")}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>Authentication & Headers</Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                  Basic auth, bearer tokens, custom headers
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textLight} />
            </Pressable>
          </>
        )}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24
  },
  inputGroup: {
    marginBottom: 12
  },
  inputHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  inputLabel: {
    fontSize: 15,
    ...fonts.semiBold
  },
  protocolBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  protocolText: {
    fontSize: 11,
    ...fonts.bold
  },
  input: {
    borderWidth: 1.5,
    padding: 16,
    borderRadius: 12,
    fontSize: 15,
    ...fonts.regular
  },
  testButton: {
    marginTop: 12
  },
  disabledButton: {
    opacity: 0.5
  },
  responseBox: {
    marginTop: 12,
    padding: 14,
    borderWidth: 1.5,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  responseText: {
    fontSize: 14,
    ...fonts.semiBold
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12
  },
  linkContent: {
    flex: 1
  },
  linkLabel: {
    fontSize: 16,
    ...fonts.semiBold,
    marginBottom: 2
  },
  linkSub: {
    fontSize: 13,
    ...fonts.regular
  },
  endpointHint: {
    marginTop: 6,
    fontSize: 12,
    ...fonts.medium
  },
  httpWarning: {
    marginTop: 6,
    fontSize: 12,
    ...fonts.medium
  }
})
