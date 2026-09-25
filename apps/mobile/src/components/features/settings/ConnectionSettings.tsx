/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { StyleSheet, View, ActivityIndicator, Keyboard } from "react-native"
import {
  Braces,
  CircleAlert,
  CircleCheckBig,
  CircleDashed,
  Cloud,
  CloudOff,
  KeyRound,
  Radio,
  ShieldCheck,
  WifiOff,
  type LucideIcon
} from "lucide-react-native"
import { Settings } from "../../../types/global"
import type { ScreenProps } from "../../../types/global"
import NativeLocationService from "../../../services/NativeLocationService"
import { endpointCarriesKey, endpointExample, isEndpointAllowed } from "../../../utils/settingsValidation"
import { isTraccarJsonFormat, isOverlandFormat } from "../../../utils/apiPayload"
import { ensureLocalNetworkPermission } from "../../../services/LocationServicePermission"
import { useTheme } from "../../../hooks/useTheme"
import { space } from "../../../constants"
import { logger } from "../../../utils/logger"
import { formatTime } from "../../../utils/geo"
import type { ServerIcon, ServerState, ServerTone } from "../../../utils/serverState"
import {
  Button,
  Card,
  Divider,
  FieldMessage,
  ListItem,
  SectionTitle,
  SettingRow,
  StateLine,
  TextField,
  Toggle
} from "../../index"
import { showChoice } from "../../../services/modalService"
import { useTranslation } from "../../../i18n/useTranslation"

interface ConnectionSettingsProps {
  settings: Settings
  /** State only; the immediate save follows through `onSettingsChange`. */
  onSettingsLocal: (next: Settings) => void
  onSettingsChange: (next: Settings) => void
  server: ServerState
  /** A recorded fix exists, which Test connection sends. */
  hasFix: boolean
  requestSummary: string
  authSummary: string
  certificateSummary: string
  navigation: ScreenProps["navigation"]
}

type Validation = { error?: string; warnings: string[] }
type TestState = { kind: "testing" } | { kind: "done"; ok: boolean; status: number; at: number; message?: string }

const SERVER_ICONS: Record<ServerIcon, LucideIcon> = {
  cloudOff: CloudOff,
  cloud: Cloud,
  wifiOff: WifiOff,
  alert: CircleAlert,
  dashed: CircleDashed,
  check: CircleCheckBig
}

export function ConnectionSettings({
  settings,
  onSettingsLocal,
  onSettingsChange,
  server,
  hasFix,
  requestSummary,
  authSummary,
  certificateSummary,
  navigation
}: ConnectionSettingsProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const [draft, setDraft] = useState(settings.endpoint)
  const [validation, setValidation] = useState<Validation>({ warnings: [] })
  const [test, setTest] = useState<TestState | null>(null)

  useEffect(() => {
    setDraft(settings.endpoint)
  }, [settings.endpoint])

  const tone = (value: ServerTone) =>
    value === "success"
      ? colors.success
      : value === "error"
        ? colors.error
        : value === "warning"
          ? colors.warning
          : value === "light"
            ? colors.textLight
            : colors.textSecondary

  const handleOfflineModeChange = useCallback(
    async (enabled: boolean) => {
      const apply = (next: Settings) => {
        onSettingsLocal(next)
        onSettingsChange(next)
      }
      if (enabled) {
        try {
          const stats = await NativeLocationService.getStats()
          if (stats.queued > 0) {
            const hasEndpoint = !!settings.endpoint
            const buttons = [
              ...(hasEndpoint ? [{ text: t("connection.offline.syncFirst"), style: "primary" as const }] : []),
              { text: t("connection.offline.keep"), style: "secondary" as const },
              { text: t("common.cancel"), style: "secondary" as const }
            ]
            const choice = await showChoice({
              title: t("connection.offline.unsent.title"),
              message: t("connection.offline.unsent.message", {
                count: stats.queued,
                n: stats.queued.toLocaleString()
              }),
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
              apply({ ...settings, isOfflineMode: true })
            } else if (action === "keep") {
              apply({ ...settings, isOfflineMode: true })
            }
            return
          }
        } catch {
          // stats fetch failed, proceed normally
        }
      }
      apply({ ...settings, isOfflineMode: enabled })
    },
    [settings, onSettingsLocal, onSettingsChange, t]
  )

  const handleDraftChange = (text: string) => {
    setDraft(text)
    setValidation({ warnings: [] })
    setTest(null)
  }

  /** Validates the draft, stores it when it passes and returns whether it did. Runs on blur and before a test. */
  const commitDraft = useCallback(async (): Promise<boolean> => {
    const text = draft.trim()
    const store = (warnings: string[]) => {
      setValidation({ warnings })
      if (text !== settings.endpoint) {
        const next = { ...settings, endpoint: text }
        onSettingsLocal(next)
        onSettingsChange(next)
      }
      return true
    }
    if (text === "") return store([])
    if (!isEndpointAllowed(text)) {
      setValidation({ error: t("connection.endpoint.scheme"), warnings: [] })
      return false
    }
    const warnings = endpointCarriesKey(text) ? [t("connection.endpoint.key")] : []
    if (text.startsWith("http://")) {
      const isPrivate = await NativeLocationService.isPrivateEndpoint(text)
      if (!isPrivate) {
        setValidation({ error: t("connection.endpoint.publicHttp"), warnings: [] })
        return false
      }
      return store([t("connection.endpoint.privateHttp"), ...warnings])
    }
    return store(warnings)
  }, [draft, settings, onSettingsLocal, onSettingsChange, t])

  const draftPasses = draft.trim() !== "" && isEndpointAllowed(draft.trim()) && !validation.error
  const testBlocker = !draft.trim()
    ? t("connection.test.noEndpoint")
    : !draftPasses
      ? t("connection.test.fixAddress")
      : !hasFix
        ? t("connection.test.needsFix")
        : null

  const handleTestEndpoint = useCallback(async () => {
    Keyboard.dismiss()
    if (testBlocker || !(await commitDraft())) return
    const endpoint = draft.trim()
    // Log only the scheme, never the endpoint or the server's reply.
    const scheme = endpoint.toLowerCase().startsWith("https://") ? "https" : "http"
    setTest({ kind: "testing" })

    try {
      const recentLocation = await NativeLocationService.getMostRecentLocation()
      if (!recentLocation) {
        setTest({ kind: "done", ok: false, status: 0, at: Date.now(), message: t("connection.test.noLocation") })
        return
      }

      const fieldMap = settings.fieldMap
      const payload: Record<string, string | number | boolean> = {}

      // Add custom fields first (matches native buildPayload order)
      for (const { key, value } of settings.customFields) {
        if (key) payload[key] = value
      }

      payload[fieldMap.lat] = recentLocation.latitude
      payload[fieldMap.lon] = recentLocation.longitude
      payload[fieldMap.acc] = Math.round(recentLocation.accuracy)

      if (fieldMap.alt) payload[fieldMap.alt] = recentLocation.altitude ?? 0
      if (fieldMap.vel) payload[fieldMap.vel] = recentLocation.speed ?? 0
      if (fieldMap.batt) payload[fieldMap.batt] = recentLocation.battery ?? 0
      if (fieldMap.bs) payload[fieldMap.bs] = recentLocation.batteryStatus ?? 0
      if (fieldMap.bear) payload[fieldMap.bear] = recentLocation.bearing ?? 0
      if (fieldMap.tst) payload[fieldMap.tst] = Math.floor(Date.now() / 1000)

      const isPrivate = await NativeLocationService.isPrivateEndpoint(endpoint)
      if (isPrivate) {
        const granted = await ensureLocalNetworkPermission()
        if (!granted) {
          setTest({
            kind: "done",
            ok: false,
            status: 0,
            at: Date.now(),
            message: t("connection.test.localNetwork")
          })
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

      const result = await NativeLocationService.testEndpoint({ endpoint, method, apiFormat, payload, customFields })
      if (!result.ok) logger.warn("[ConnectionSettings] Test failed:", result.status, scheme)
      setTest({
        kind: "done",
        ok: result.ok,
        status: result.status,
        at: Date.now(),
        message: result.ok
          ? undefined
          : result.errorMessage || t("connection.test.serverReturned", { status: result.status })
      })
    } catch (err: any) {
      const msg = err?.message || t("common.unknownError")
      logger.warn("[ConnectionSettings] Test failed:", err?.code, scheme)
      setTest({
        kind: "done",
        ok: false,
        status: 0,
        at: Date.now(),
        message: t("connection.test.failed", { message: msg })
      })
    }
  }, [testBlocker, commitDraft, draft, settings, t])

  const example = endpointExample(settings.apiTemplate, settings.dawarichMode)
  const helper = t("connection.endpoint.helper")
  const ServerGlyph = SERVER_ICONS[server.icon]

  return (
    <View>
      <SectionTitle>{t("connection.section.server")}</SectionTitle>
      <Card rows>
        <StateLine
          icon={ServerGlyph}
          iconColor={tone(server.tone)}
          label={server.word}
          caption={server.caption}
          testID="server-state"
        />
        <Divider tight />
        <SettingRow label={t("connection.offline")} hint={t("connection.offline.hint")}>
          <Toggle
            accessibilityLabel={t("connection.offline")}
            value={settings.isOfflineMode}
            onValueChange={handleOfflineModeChange}
          />
        </SettingRow>

        {/* A standalone tracker never sends, so the server and its details leave the screen with the toggle. */}
        {!settings.isOfflineMode && (
          <>
            <Divider tight />

            <View style={styles.block}>
              <View>
                <TextField
                  label={t("connection.endpoint")}
                  testID="endpoint-input"
                  mono
                  value={draft}
                  onChangeText={handleDraftChange}
                  onBlur={() => {
                    commitDraft()
                  }}
                  placeholder={example}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  error={validation.error}
                />
                {!validation.error && <FieldMessage>{helper}</FieldMessage>}
                {validation.warnings.map((warning) => (
                  <FieldMessage key={warning} variant="warning">
                    {warning}
                  </FieldMessage>
                ))}
              </View>

              <View>
                <Button
                  icon={Radio}
                  title={t("connection.test")}
                  onPress={handleTestEndpoint}
                  disabled={testBlocker !== null}
                  loading={test?.kind === "testing"}
                  testID="test-connection-btn"
                />
                {testBlocker ? <FieldMessage>{testBlocker}</FieldMessage> : null}
              </View>

              {test?.kind === "testing" && (
                <StateLine
                  icon={<ActivityIndicator size="small" color={colors.textLight} />}
                  iconColor={colors.textLight}
                  label={t("connection.test.testing")}
                  caption={t("connection.test.sending")}
                  testID="test-result"
                />
              )}
              {test?.kind === "done" && (
                <View>
                  <StateLine
                    icon={test.ok ? CircleCheckBig : CircleAlert}
                    iconColor={test.ok ? colors.success : colors.error}
                    label={test.ok ? t("connection.test.reachable") : t("connection.test.notReachable")}
                    caption={`${test.status > 0 ? t("connection.test.http", { status: test.status }) : t("connection.test.noResponse")} · ${formatTime(Math.floor(test.at / 1000))}`}
                    testID="test-result"
                  />
                  {!test.ok && test.message ? <FieldMessage variant="error">{test.message}</FieldMessage> : null}
                </View>
              )}
            </View>
          </>
        )}
      </Card>

      {!settings.isOfflineMode && (
        <>
          <SectionTitle style={styles.groupTop}>{t("connection.section.details")}</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-request-format"
              icon={Braces}
              label={t("screen.requestFormat")}
              sub={requestSummary}
              onPress={() => navigation.navigate("Request Format")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-auth-settings"
              icon={KeyRound}
              label={t("screen.authSettings")}
              sub={authSummary}
              onPress={() => navigation.navigate("Auth Settings")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-mtls-settings"
              icon={ShieldCheck}
              label={t("screen.mtlsSettings")}
              sub={certificateSummary}
              onPress={() => navigation.navigate("mTLS Settings")}
            />
          </Card>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  groupTop: {
    marginTop: space.xl
  },
  block: {
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.lg
  }
})
