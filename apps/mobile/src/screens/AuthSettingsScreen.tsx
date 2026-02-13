/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import { Text, StyleSheet, TextInput, View, ScrollView, TouchableOpacity } from "react-native"
import { AuthConfig, AuthType, DEFAULT_AUTH_CONFIG, ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { SectionTitle, FloatingSaveIndicator, Container, Card, Divider } from "../components"
import NativeLocationService from "../services/NativeLocationService"

const AUTOSAVE_DEBOUNCE_MS = 1500

const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic Auth" },
  { value: "bearer", label: "Bearer Token" }
]

/**
 * Screen for configuring endpoint authentication and custom headers.
 */
export function AuthSettingsScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const { restartTracking, settings } = useTracking()

  const [config, setConfig] = useState<AuthConfig>(DEFAULT_AUTH_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load config on mount
  useEffect(() => {
    ;(async () => {
      try {
        const saved = await NativeLocationService.getAuthConfig()
        setConfig(saved)
      } catch (err) {
        console.error("[AuthSettingsScreen] Failed to load auth config:", err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
    }
  }, [])

  const saveConfig = useCallback(
    async (newConfig: AuthConfig) => {
      setSaving(true)
      try {
        await NativeLocationService.saveAuthConfig(newConfig)

        // Debounce the restart — only fires once after settings stabilize
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
        restartTimeoutRef.current = setTimeout(async () => {
          try {
            await restartTracking(settings)
            setSaveSuccess(true)
            setTimeout(() => setSaveSuccess(false), 2000)
          } catch (err) {
            console.error("[AuthSettingsScreen] Restart failed:", err)
          } finally {
            setSaving(false)
          }
        }, AUTOSAVE_DEBOUNCE_MS)
      } catch (err) {
        setSaving(false)
        console.error("[AuthSettingsScreen] Save failed:", err)
      }
    },
    [restartTracking, settings]
  )

  const debouncedSave = useCallback(
    (newConfig: AuthConfig) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => saveConfig(newConfig), AUTOSAVE_DEBOUNCE_MS)
    },
    [saveConfig]
  )

  const updateConfig = useCallback(
    (partial: Partial<AuthConfig>) => {
      const next = { ...config, ...partial }
      setConfig(next)
      debouncedSave(next)
    },
    [config, debouncedSave]
  )

  const handleAuthTypeChange = useCallback(
    (authType: AuthType) => {
      const next = { ...config, authType }
      setConfig(next)
      // Immediate save for auth type change
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveConfig(next)
    },
    [config, saveConfig]
  )

  // Custom headers as array for rendering
  const headerEntries = Object.entries(config.customHeaders)

  const addHeader = useCallback(() => {
    updateConfig({
      customHeaders: { ...config.customHeaders, "": "" }
    })
  }, [config, updateConfig])

  const updateHeaderKey = useCallback(
    (oldKey: string, newKey: string, index: number) => {
      const entries = Object.entries(config.customHeaders)
      entries[index] = [newKey, entries[index][1]]
      const newHeaders = Object.fromEntries(entries)
      updateConfig({ customHeaders: newHeaders })
    },
    [config, updateConfig]
  )

  const updateHeaderValue = useCallback(
    (key: string, value: string, index: number) => {
      const entries = Object.entries(config.customHeaders)
      entries[index] = [entries[index][0], value]
      const newHeaders = Object.fromEntries(entries)
      updateConfig({ customHeaders: newHeaders })
    },
    [config, updateConfig]
  )

  const removeHeader = useCallback(
    (index: number) => {
      const entries = Object.entries(config.customHeaders)
      entries.splice(index, 1)
      const next = { ...config, customHeaders: Object.fromEntries(entries) }
      setConfig(next)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveConfig(next)
    },
    [config, saveConfig]
  )

  if (loading) {
    return (
      <Container>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
        </View>
      </Container>
    )
  }

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Authentication & Headers</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Secure your endpoint connection</Text>
        </View>

        {/* Authentication Section */}
        <View style={styles.section}>
          <SectionTitle>Authentication</SectionTitle>
          <Card>
            {/* Auth type picker */}
            <View style={styles.chipRow}>
              {AUTH_TYPES.map(({ value, label }) => {
                const isSelected = config.authType === value
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.chip,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background
                      },
                      isSelected && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primary + "20"
                      }
                    ]}
                    onPress={() => handleAuthTypeChange(value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: isSelected ? colors.primary : colors.text
                        }
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Basic Auth fields */}
            {config.authType === "basic" && (
              <>
                <Divider />
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Username</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.background
                      }
                    ]}
                    value={config.username}
                    onChangeText={(v) => updateConfig({ username: v })}
                    placeholder="Username"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={[styles.fieldLabel, styles.fieldLabelSpaced, { color: colors.text }]}>Password</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.background
                      }
                    ]}
                    value={config.password}
                    onChangeText={(v) => updateConfig({ password: v })}
                    placeholder="Password"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                </View>
              </>
            )}

            {/* Bearer Token field */}
            {config.authType === "bearer" && (
              <>
                <Divider />
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Token</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.background
                      }
                    ]}
                    value={config.bearerToken}
                    onChangeText={(v) => updateConfig({ bearerToken: v })}
                    placeholder="Bearer token"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                </View>
              </>
            )}
          </Card>
        </View>

        {/* Custom Headers Section */}
        <View style={styles.section}>
          <SectionTitle>Custom Headers</SectionTitle>
          <Card>
            {headerEntries.length === 0 ? (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>No custom headers configured</Text>
            ) : (
              headerEntries.map(([key, value], index) => (
                <View key={index}>
                  {index > 0 && <Divider />}
                  <View style={styles.headerRow}>
                    <View style={styles.headerInputs}>
                      <TextInput
                        style={[
                          styles.headerInput,
                          {
                            borderColor: colors.border,
                            color: colors.text,
                            backgroundColor: colors.background
                          }
                        ]}
                        value={key}
                        onChangeText={(v) => updateHeaderKey(key, v, index)}
                        placeholder="Header name"
                        placeholderTextColor={colors.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TextInput
                        style={[
                          styles.headerInput,
                          {
                            borderColor: colors.border,
                            color: colors.text,
                            backgroundColor: colors.background
                          }
                        ]}
                        value={value}
                        onChangeText={(v) => updateHeaderValue(key, v, index)}
                        placeholder="Value"
                        placeholderTextColor={colors.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => removeHeader(index)}
                      style={[styles.removeButton, { backgroundColor: colors.error + "15" }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.removeButtonText, { color: colors.error }]}>X</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            {headerEntries.length > 0 && <Divider />}

            <TouchableOpacity
              style={[styles.addButton, { borderColor: colors.primary }]}
              onPress={addHeader}
              activeOpacity={0.7}
            >
              <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add Header</Text>
            </TouchableOpacity>

            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              e.g., CF-Access-Client-Id for Cloudflare Access
            </Text>
          </Card>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textLight }]}>
            Credentials and headers are stored encrypted on device
          </Text>
        </View>
      </ScrollView>

      <FloatingSaveIndicator saving={saving} success={saveSuccess} colors={colors} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    fontSize: 15
  },
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20
  },
  section: {
    marginBottom: 24
  },
  chipRow: {
    flexDirection: "row",
    gap: 10
  },
  chip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700"
  },
  fieldGroup: {
    marginTop: 4
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8
  },
  fieldLabelSpaced: {
    marginTop: 14
  },
  input: {
    borderWidth: 1.5,
    padding: 14,
    borderRadius: 12,
    fontSize: 15
  },
  emptyHint: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 8
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8
  },
  headerInputs: {
    flex: 1,
    gap: 8
  },
  headerInput: {
    borderWidth: 1.5,
    padding: 12,
    borderRadius: 10,
    fontSize: 14
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center"
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: "700"
  },
  addButton: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginTop: 4
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: "600"
  },
  hint: {
    fontSize: 12,
    marginTop: 10,
    textAlign: "center"
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center"
  },
  footerText: {
    fontSize: 11,
    textAlign: "center"
  }
})
