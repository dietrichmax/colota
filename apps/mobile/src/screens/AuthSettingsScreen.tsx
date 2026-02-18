/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Text, StyleSheet, TextInput, View, ScrollView, TouchableOpacity } from "react-native"
import { AuthConfig, AuthType, DEFAULT_AUTH_CONFIG, ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useAutoSave } from "../hooks/useAutoSave"
import { useTracking } from "../contexts/TrackingProvider"
import { fonts, fontSizes } from "../styles/typography"
import { SectionTitle, FloatingSaveIndicator, Container, Card, Divider, ChipGroup } from "../components"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { findDuplicates } from "../utils/settingsValidation"

const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic Auth" },
  { value: "bearer", label: "Bearer Token" }
]

type LocalHeader = { key: string; value: string; id: number }

/**
 * Screen for configuring endpoint authentication and custom headers.
 */
export function AuthSettingsScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const { restartTracking, settings } = useTracking()

  const [config, setConfig] = useState<AuthConfig>(DEFAULT_AUTH_CONFIG)
  const [loading, setLoading] = useState(true)
  const { saving, saveSuccess, debouncedSaveAndRestart, immediateSaveAndRestart } = useAutoSave()

  const nextIdRef = useRef(0)
  const assignId = () => nextIdRef.current++

  const [localHeaders, setLocalHeaders] = useState<LocalHeader[]>([])

  // Load config on mount
  useEffect(() => {
    ;(async () => {
      try {
        const saved = await NativeLocationService.getAuthConfig()
        setConfig(saved)
        setLocalHeaders(Object.entries(saved.customHeaders).map(([key, value]) => ({ key, value, id: assignId() })))
      } catch (err) {
        logger.error("[AuthSettingsScreen] Failed to load auth config:", err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  /** Detect duplicate header keys */
  const duplicateKeys = useMemo(() => {
    const keys = localHeaders.map((h) => h.key.trim()).filter(Boolean)
    return findDuplicates(keys)
  }, [localHeaders])

  /** Convert local headers array to Record for saving */
  const headersToRecord = useCallback((headers: LocalHeader[]): Record<string, string> => {
    const record: Record<string, string> = {}
    for (const h of headers) {
      const k = h.key.trim()
      if (k) record[k] = h.value.trim()
    }
    return record
  }, [])

  const debouncedSave = useCallback(
    (newConfig: AuthConfig) => {
      debouncedSaveAndRestart(
        async () => {
          await NativeLocationService.saveAuthConfig(newConfig)
        },
        () => restartTracking(settings)
      )
    },
    [debouncedSaveAndRestart, restartTracking, settings]
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
      immediateSaveAndRestart(
        async () => {
          await NativeLocationService.saveAuthConfig(next)
        },
        () => restartTracking(settings)
      )
    },
    [config, immediateSaveAndRestart, restartTracking, settings]
  )

  const addHeader = useCallback(() => {
    setLocalHeaders((prev) => [...prev, { key: "", value: "", id: assignId() }])
  }, [])

  const updateHeaderField = useCallback(
    (id: number, field: "key" | "value", text: string) => {
      const next = localHeaders.map((h) => (h.id === id ? { ...h, [field]: text } : h))
      setLocalHeaders(next)
      updateConfig({ customHeaders: headersToRecord(next) })
    },
    [localHeaders, updateConfig, headersToRecord]
  )

  const removeHeader = useCallback(
    (id: number) => {
      const next = localHeaders.filter((h) => h.id !== id)
      setLocalHeaders(next)
      const nextConfig = { ...config, customHeaders: headersToRecord(next) }
      setConfig(nextConfig)
      immediateSaveAndRestart(
        async () => {
          await NativeLocationService.saveAuthConfig(nextConfig)
        },
        () => restartTracking(settings)
      )
    },
    [localHeaders, config, headersToRecord, immediateSaveAndRestart, restartTracking, settings]
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
            <ChipGroup
              options={AUTH_TYPES}
              selected={config.authType}
              onSelect={handleAuthTypeChange}
              colors={colors}
            />

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
                      styles.tokenInput,
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
                    multiline
                    textAlignVertical="top"
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
            {localHeaders.length === 0 ? (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>No custom headers configured</Text>
            ) : (
              localHeaders.map((header, index) => {
                const isDuplicate = header.key.trim() !== "" && duplicateKeys.has(header.key.trim())
                return (
                  <View key={header.id}>
                    {index > 0 && <Divider />}
                    <View style={styles.headerRow}>
                      <View style={styles.headerInputs}>
                        <TextInput
                          style={[
                            styles.headerInput,
                            {
                              borderColor: isDuplicate ? colors.error : colors.border,
                              color: colors.text,
                              backgroundColor: colors.background
                            }
                          ]}
                          value={header.key}
                          onChangeText={(v) => updateHeaderField(header.id, "key", v)}
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
                          value={header.value}
                          onChangeText={(v) => updateHeaderField(header.id, "value", v)}
                          placeholder="Value"
                          placeholderTextColor={colors.placeholder}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => removeHeader(header.id)}
                        style={[styles.removeButton, { backgroundColor: colors.error + "15" }]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.removeButtonText, { color: colors.error }]}>X</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })
            )}

            {localHeaders.length > 0 && <Divider />}

            <TouchableOpacity
              style={[styles.addButton, { borderColor: colors.primary }]}
              onPress={addHeader}
              activeOpacity={0.7}
            >
              <Text style={[styles.addButtonText, { color: colors.primaryDark }]}>+ Add Header</Text>
            </TouchableOpacity>

            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              e.g., CF-Access-Client-Id for Cloudflare Access
            </Text>
          </Card>
        </View>

        {/* Duplicate key warning */}
        {duplicateKeys.size > 0 && (
          <View
            style={[styles.warningBanner, { backgroundColor: colors.error + "15", borderColor: colors.error + "40" }]}
          >
            <Text style={[styles.warningText, { color: colors.error }]}>
              Duplicate header names: {[...duplicateKeys].join(", ")}. Only the last value will be sent.
            </Text>
          </View>
        )}

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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    fontSize: 15,
    ...fonts.regular
  },
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    letterSpacing: -0.5,
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    ...fonts.regular,
    lineHeight: 20
  },
  section: {
    marginBottom: 24
  },
  fieldGroup: {
    marginTop: 4
  },
  fieldLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
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
  tokenInput: {
    minHeight: 80,
    fontFamily: "monospace",
    fontSize: 13
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
    ...fonts.bold
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
    ...fonts.semiBold
  },
  hint: {
    fontSize: 12,
    marginTop: 10,
    textAlign: "center"
  },
  warningBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18
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
