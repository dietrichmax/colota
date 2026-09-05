/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Text, StyleSheet, View, ScrollView, Pressable } from "react-native"
import { Plus, X } from "lucide-react-native"
import { AuthConfig, AuthType, DEFAULT_AUTH_CONFIG, ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useAutoSave } from "../hooks/useAutoSave"
import { useTracking } from "../contexts/TrackingProvider"
import { useTranslation } from "../i18n/useTranslation"
import { text } from "../styles/typography"
import { Button, ChipGroup, Container, Divider, ListItem, Notice, SectionTitle, TextField, Toast } from "../components"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { findDuplicates } from "../utils/settingsValidation"
import { size, space, STATE_LAYER_ALPHA } from "../constants"

type LocalHeader = { key: string; value: string; id: number }

/**
 * Screen for configuring endpoint authentication and custom headers.
 */
export function AuthSettingsScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
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

  const authTypeOptions = useMemo(
    () => [
      { value: "none" as AuthType, label: t("auth.type.none") },
      { value: "basic" as AuthType, label: t("auth.type.basic") },
      { value: "bearer" as AuthType, label: t("auth.type.bearer") }
    ],
    [t]
  )

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
    (id: number, field: "key" | "value", value: string) => {
      const next = localHeaders.map((h) => (h.id === id ? { ...h, [field]: value } : h))
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
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t("auth.loading")}</Text>
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
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("auth.intro")}</Text>

        <View style={styles.chipBlock}>
          <ChipGroup
            options={authTypeOptions}
            selected={config.authType}
            onSelect={handleAuthTypeChange}
            accessibilityLabel={t("auth.method")}
          />
        </View>

        {config.authType === "basic" && (
          <View>
            <TextField
              label={t("auth.username")}
              value={config.username}
              onChangeText={(v) => updateConfig({ username: v })}
              placeholder={t("auth.username")}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
            />
            <TextField
              label={t("auth.password")}
              value={config.password}
              onChangeText={(v) => updateConfig({ password: v })}
              placeholder={t("auth.password")}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              secureTextEntry
              containerStyle={styles.stackedField}
            />
          </View>
        )}

        {config.authType === "bearer" && (
          <TextField
            label={t("auth.token")}
            mono
            value={config.bearerToken}
            onChangeText={(v) => updateConfig({ bearerToken: v })}
            placeholder={t("auth.token.placeholder")}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            multiline
            textAlignVertical="top"
          />
        )}

        <SectionTitle>{t("auth.customHeaders")}</SectionTitle>

        {localHeaders.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t("auth.customHeaders.empty")}</Text>
        ) : (
          localHeaders.map((header, index) => {
            const isDuplicate = header.key.trim() !== "" && duplicateKeys.has(header.key.trim())
            return (
              <View key={header.id}>
                {index > 0 && <Divider tight />}
                <View style={styles.headerRow}>
                  <View style={styles.headerInputs}>
                    <TextField
                      label={t("auth.header.name")}
                      error={isDuplicate ? t("auth.header.duplicate") : undefined}
                      mono
                      value={header.key}
                      onChangeText={(v) => updateHeaderField(header.id, "key", v)}
                      placeholder={t("auth.header.name")}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextField
                      label={t("auth.header.value")}
                      mono
                      value={header.value}
                      onChangeText={(v) => updateHeaderField(header.id, "value", v)}
                      placeholder={t("auth.header.value")}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      importantForAutofill="no"
                      containerStyle={styles.stackedField}
                    />
                  </View>
                  <Pressable
                    testID={`remove-header-${header.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={t("auth.header.remove", { name: header.key || t("auth.header.name") })}
                    android_ripple={{ color: colors.error + STATE_LAYER_ALPHA, borderless: true, radius: 20 }}
                    onPress={() => removeHeader(header.id)}
                    style={styles.removeButton}
                  >
                    <X size={size.icon.md} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            )
          })
        )}

        <Button
          testID="add-header-btn"
          title={t("auth.header.add")}
          variant="ghost"
          align="start"
          icon={Plus}
          onPress={addHeader}
          style={styles.addButton}
        />

        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t("auth.customHeaders.example")}</Text>

        {duplicateKeys.size > 0 && (
          <View style={styles.notice}>
            <Notice
              testID="duplicate-headers-notice"
              variant="error"
              title={t("auth.header.duplicates", { names: [...duplicateKeys].join(", ") })}
              message={t("auth.header.duplicates.message")}
            />
          </View>
        )}

        <View style={styles.certGroup}>
          <ListItem
            testID="nav-mtls-settings"
            label={t("auth.clientCertificate")}
            sub={t("auth.clientCertificate.sub")}
            onPress={() => navigation.navigate("mTLS Settings")}
          />
        </View>

        <Text style={[styles.footer, { color: colors.textLight }]}>{t("auth.storedEncrypted")}</Text>
      </ScrollView>

      <Toast saving={saving} success={saveSuccess} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    ...text.body
  },
  intro: {
    ...text.body
  },
  chipBlock: {
    paddingVertical: space.lg
  },
  stackedField: {
    marginTop: space.lg
  },
  hint: {
    ...text.label,
    marginTop: space.sm
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    paddingVertical: space.md
  },
  headerInputs: {
    flex: 1
  },
  removeButton: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  addButton: {
    marginTop: space.sm
  },
  notice: {
    marginTop: space.lg
  },
  certGroup: {
    marginTop: space.xxl
  },
  footer: {
    ...text.caption,
    marginTop: space.xxl
  }
})
