/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import { Text, StyleSheet, View, ScrollView, ActivityIndicator } from "react-native"
import { X } from "lucide-react-native"
import { AuthConfig, AuthType, DEFAULT_AUTH_CONFIG, ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useAutoSave } from "../hooks/useAutoSave"
import { useTracking } from "../contexts/TrackingProvider"
import { fonts, fontSizes, lineHeights } from "../styles/typography"
import {
  SectionTitle,
  FloatingSaveIndicator,
  Container,
  Card,
  Divider,
  RadioRow,
  Button,
  TextField,
  FieldMessage,
  IconButton
} from "../components"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { size, space } from "../constants"

const METHODS: { value: AuthType; label: string; sub: string }[] = [
  {
    value: "none",
    label: "None",
    sub: "No Authorization header. Use with a key in the address, a custom header or a client certificate."
  },
  {
    value: "basic",
    label: "Basic auth",
    sub: "Sends Authorization: Basic with the username and password encoded, not encrypted. Only safe over https."
  },
  { value: "bearer", label: "Bearer token", sub: "Sends Authorization: Bearer with the token." }
]

const SECRET_SET = "Set · encrypted on this device, in encrypted backups. Type to replace."
const SECRET_UNSET = "Not set · encrypted once saved."
const DUPLICATE_HEADER = "Also used above. Only the last value is sent."
const SENSITIVE_HEADER = /authorization|cookie|token|key|secret/i

type LocalHeader = { key: string; value: string; id: number }

/** A method owns its credentials: choosing one drops the others', so a never-echoed secret can still be cleared. */
export function withMethod(config: AuthConfig, authType: AuthType): AuthConfig {
  return {
    ...config,
    authType,
    username: authType === "basic" ? config.username : "",
    password: authType === "basic" ? config.password : "",
    bearerToken: authType === "bearer" ? config.bearerToken : ""
  }
}

export function AuthSettingsScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const { restartTracking, settings } = useTracking()

  const [config, setConfig] = useState<AuthConfig>(DEFAULT_AUTH_CONFIG)
  const configRef = useRef(config)
  configRef.current = config
  const [loading, setLoading] = useState(true)
  const [passwordDraft, setPasswordDraft] = useState("")
  const [tokenDraft, setTokenDraft] = useState("")
  const {
    saving,
    message: saveMessage,
    isError: saveIsError,
    debouncedSaveAndRestart,
    immediateSaveAndRestart
  } = useAutoSave()

  const nextIdRef = useRef(0)
  const assignId = () => nextIdRef.current++

  const [localHeaders, setLocalHeaders] = useState<LocalHeader[]>([])

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

  const headersToRecord = (headers: LocalHeader[]): Record<string, string> => {
    const record: Record<string, string> = {}
    for (const h of headers) {
      const k = h.key.trim()
      if (k) record[k] = h.value.trim()
    }
    return record
  }

  const saveNow = useCallback(
    (next: AuthConfig) => {
      setConfig(next)
      immediateSaveAndRestart(
        async () => {
          await NativeLocationService.saveAuthConfig(next)
        },
        () => restartTracking(settings)
      )
    },
    [immediateSaveAndRestart, restartTracking, settings]
  )

  const saveSoon = useCallback(
    (partial: Partial<AuthConfig>) => {
      const next = { ...configRef.current, ...partial }
      setConfig(next)
      debouncedSaveAndRestart(
        async () => {
          await NativeLocationService.saveAuthConfig(next)
        },
        () => restartTracking(settings)
      )
    },
    [debouncedSaveAndRestart, restartTracking, settings]
  )

  const handleMethod = (authType: AuthType) => {
    if (authType === config.authType) return
    setPasswordDraft("")
    setTokenDraft("")
    saveNow(withMethod(config, authType))
  }

  const handleSecret = (key: "password" | "bearerToken", text: string) => {
    if (key === "password") setPasswordDraft(text)
    else setTokenDraft(text)
    // An empty draft keeps the stored value; choosing another method is how a secret is cleared.
    if (text !== "") saveSoon({ [key]: text })
  }

  const addHeader = () => setLocalHeaders((prev) => [...prev, { key: "", value: "", id: assignId() }])

  const updateHeaderField = (id: number, field: "key" | "value", text: string) => {
    const next = localHeaders.map((h) => (h.id === id ? { ...h, [field]: text } : h))
    setLocalHeaders(next)
    saveSoon({ customHeaders: headersToRecord(next) })
  }

  const removeHeader = (id: number) => {
    const next = localHeaders.filter((h) => h.id !== id)
    setLocalHeaders(next)
    saveNow({ ...configRef.current, customHeaders: headersToRecord(next) })
  }

  if (loading) {
    return (
      <Container>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Container>
    )
  }

  const secretHint = (stored: string) => (stored !== "" ? SECRET_SET : SECRET_UNSET)

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          How each request proves who it is from. Stored encrypted on this device and in encrypted backups. A setup link
          you share carries it in the clear.
        </Text>

        <SectionTitle>Method</SectionTitle>
        <Card rows>
          <View accessibilityRole="radiogroup" style={styles.group}>
            {METHODS.map(({ value, label, sub }) => (
              <React.Fragment key={value}>
                <RadioRow
                  testID={`auth-${value}`}
                  label={label}
                  sub={sub}
                  selected={config.authType === value}
                  onPress={() => handleMethod(value)}
                />
                {value === "basic" && config.authType === "basic" && (
                  <View style={styles.reveal}>
                    <TextField
                      label="Username"
                      testID="basic-username"
                      value={config.username}
                      onChangeText={(v) => saveSoon({ username: v })}
                      placeholder="Username"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                    />
                    <View>
                      <TextField
                        label="Password"
                        testID="basic-password"
                        value={passwordDraft}
                        onChangeText={(v) => handleSecret("password", v)}
                        placeholder="Password"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="password"
                        secure
                      />
                      <FieldMessage>{secretHint(config.password)}</FieldMessage>
                    </View>
                  </View>
                )}
                {value === "bearer" && config.authType === "bearer" && (
                  <View style={styles.reveal}>
                    <View>
                      <TextField
                        label="Token"
                        testID="bearer-token"
                        mono
                        value={tokenDraft}
                        onChangeText={(v) => handleSecret("bearerToken", v)}
                        placeholder="Paste the token"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        importantForAutofill="no"
                        secure
                      />
                      <FieldMessage>{secretHint(config.bearerToken)}</FieldMessage>
                    </View>
                  </View>
                )}
              </React.Fragment>
            ))}
          </View>
          <Divider tight />
          <View style={styles.footer}>
            <FieldMessage>Choosing a method removes the credentials stored for the others.</FieldMessage>
          </View>
        </Card>

        <SectionTitle style={styles.groupTop}>Custom headers</SectionTitle>
        <Card rows>
          {localHeaders.length === 0 ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              None. A custom header is sent with every request.
            </Text>
          ) : (
            localHeaders.map((header, index) => {
              const name = header.key.trim()
              const isDuplicate = name !== "" && localHeaders.slice(0, index).some((h) => h.key.trim() === name)
              return (
                <View key={header.id}>
                  {index > 0 && <Divider tight />}
                  <View style={styles.headerRow}>
                    <View style={styles.headerInputs}>
                      <TextField
                        accessibilityLabel="Header name"
                        testID={`header-key-${header.id}`}
                        mono
                        error={isDuplicate ? DUPLICATE_HEADER : undefined}
                        value={header.key}
                        onChangeText={(v) => updateHeaderField(header.id, "key", v)}
                        placeholder="Name"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TextField
                        accessibilityLabel="Header value"
                        testID={`header-value-${header.id}`}
                        value={header.value}
                        onChangeText={(v) => updateHeaderField(header.id, "value", v)}
                        placeholder="Value"
                        autoCapitalize="none"
                        autoCorrect={false}
                        secure={SENSITIVE_HEADER.test(name)}
                      />
                    </View>
                    <IconButton
                      icon={X}
                      tone="danger"
                      testID={`remove-header-${header.id}`}
                      accessibilityLabel={name ? `Remove header ${name}` : "Remove header"}
                      onPress={() => removeHeader(header.id)}
                    />
                  </View>
                </View>
              )
            })
          )}
          <Divider tight />
          <View style={styles.footer}>
            <Button title="+ Add header" onPress={addHeader} variant="secondary" testID="add-header-btn" />
            <FieldMessage>Example: CF-Access-Client-Id for Cloudflare Access.</FieldMessage>
          </View>
        </Card>
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  group: {
    marginTop: -space.sm
  },
  groupTop: {
    marginTop: space.xl
  },
  // The row above already pays space.lg below it; the fields' gap is the rhythm to the next row.
  reveal: {
    paddingLeft: size.iconColumn,
    marginTop: -space.xs,
    paddingBottom: space.lg,
    gap: space.lg
  },
  footer: {
    paddingTop: space.xs,
    paddingBottom: space.lg
  },
  description: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    lineHeight: lineHeights.description,
    paddingTop: space.lg,
    paddingBottom: space.md
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md
  },
  headerInputs: {
    flex: 1,
    gap: space.sm
  }
})
