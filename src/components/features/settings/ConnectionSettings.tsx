/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback } from "react"
import { Text, StyleSheet, TextInput, Switch, View, TouchableOpacity } from "react-native"
import { Settings, ThemeColors } from "../../../types/global"
import NativeLocationService from "../../../services/NativeLocationService"
import { isPrivateHost, isEndpointAllowed } from "../../../utils/settingsValidation"
import { Button, Card, SectionTitle, Divider } from "../../index"

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

  const handleOfflineModeChange = useCallback(
    (enabled: boolean) => {
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
        setTestResponse("No location data yet — Start tracking to collect a test point, then try again.")
        setTestError(true)
        return
      }

      const fieldMap = settings.fieldMap
      const payload: Record<string, number | boolean> = {
        [fieldMap.lat]: recentLocation.latitude,
        [fieldMap.lon]: recentLocation.longitude,
        [fieldMap.acc]: Math.round(recentLocation.accuracy)
      }

      if (fieldMap.alt) payload[fieldMap.alt] = 0
      if (fieldMap.vel) payload[fieldMap.vel] = 0
      if (fieldMap.batt) payload[fieldMap.batt] = 0
      if (fieldMap.bs) payload[fieldMap.bs] = 0
      if (fieldMap.tst) {
        payload[fieldMap.tst] = Math.floor(Date.now() / 1000)
      }

      let authHeaders: Record<string, string> = {}
      try {
        authHeaders = await NativeLocationService.getAuthHeaders()
      } catch {
        // proceed without auth headers
      }

      const response = await fetch(endpointInput, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        setTestResponse("✓ Connection successful")
        onSettingsChange({ ...settings, endpoint: endpointInput })
      } else {
        setTestResponse(`Failed: ${response.status}`)
        setTestError(true)
      }
    } catch (err: any) {
      setTestResponse(err.message || "Connection failed")
      setTestError(true)
    } finally {
      setTesting(false)
      setTimeout(() => setTestResponse(null), 3000)
    }
  }, [endpointInput, settings, onSettingsChange])

  return (
    <View style={styles.section}>
      <SectionTitle>Connection</SectionTitle>
      <Card>
        <View style={styles.settingRow}>
          <View style={styles.settingContent}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Offline Mode</Text>
            <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Save locally, no network sync</Text>
          </View>
          <Switch
            value={settings.isOfflineMode}
            onValueChange={handleOfflineModeChange}
            trackColor={{
              false: colors.border,
              true: colors.primary + "80"
            }}
            thumbColor={settings.isOfflineMode ? colors.primary : "#f4f3f4"}
          />
        </View>

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
                  No server configured — locations are saved locally
                </Text>
              )}

              {endpointInput.startsWith("http://") && !isPrivateHost(endpointInput) && (
                <Text style={[styles.httpWarning, { color: colors.warning }]}>
                  HTTP only allowed for private IPs / localhost
                </Text>
              )}
            </View>

            <Button
              style={[
                styles.testButton,
                { backgroundColor: colors.primary },
                (!endpointInput || !isEndpointAllowed(endpointInput)) && styles.disabledButton
              ]}
              onPress={() => {
                if (!endpointInput || !isEndpointAllowed(endpointInput)) return
                handleTestEndpoint()
              }}
              title={testing ? "Testing..." : "Test Connection"}
              color="#f8f7f7"
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
                <Text style={[styles.responseText, { color: testError ? colors.error : colors.success }]}>
                  {testResponse}
                </Text>
              </View>
            )}

            <Divider />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate("Auth Settings")}
              activeOpacity={0.6}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>Authentication & Headers</Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                  Basic auth, bearer tokens, custom headers
                </Text>
              </View>
              <Text style={[styles.linkArrow, { color: colors.textLight }]}>›</Text>
            </TouchableOpacity>
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
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4
  },
  settingContent: {
    flex: 1,
    marginRight: 16
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2
  },
  settingHint: {
    fontSize: 13,
    lineHeight: 18
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
    fontWeight: "600"
  },
  protocolBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  protocolText: {
    fontSize: 11,
    fontWeight: "700"
  },
  input: {
    borderWidth: 1.5,
    padding: 16,
    borderRadius: 12,
    fontSize: 15
  },
  testButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
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
    alignItems: "center"
  },
  responseText: {
    fontSize: 14,
    fontWeight: "600"
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
    fontWeight: "600",
    marginBottom: 2
  },
  linkSub: {
    fontSize: 13
  },
  linkArrow: {
    fontSize: 28,
    fontWeight: "300",
    marginLeft: 12
  },
  endpointHint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "500"
  },
  httpWarning: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "500"
  }
})
