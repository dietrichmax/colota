/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, View, ActivityIndicator, Keyboard } from "react-native"
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
import { fontSizes, fonts, lineHeights } from "../../../styles/typography"
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

const SCHEME_ERROR = "Starts with http:// or https:// and names a host."
const PUBLIC_HTTP_ERROR = "http is refused for a public host. Use https."
const PRIVATE_HTTP_WARNING = "Not encrypted: plain http on a private host."
const KEY_WARNING =
  "This address carries a key. It is stored with settings, not encrypted, and included in setup links. Use a header where the server allows it."

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
  const [draft, setDraft] = useState(settings.endpoint)
  const [validation, setValidation] = useState<Validation>({ warnings: [] })
  const [test, setTest] = useState<TestState | null>(null)

  useEffect(() => {
    setDraft(settings.endpoint)
  }, [settings.endpoint])

  const tone = (t: ServerTone) =>
    t === "success"
      ? colors.success
      : t === "error"
        ? colors.error
        : t === "warning"
          ? colors.warning
          : t === "light"
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
    [settings, onSettingsLocal, onSettingsChange]
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
      setValidation({ error: SCHEME_ERROR, warnings: [] })
      return false
    }
    const warnings = endpointCarriesKey(text) ? [KEY_WARNING] : []
    if (text.startsWith("http://")) {
      const isPrivate = await NativeLocationService.isPrivateEndpoint(text)
      if (!isPrivate) {
        setValidation({ error: PUBLIC_HTTP_ERROR, warnings: [] })
        return false
      }
      return store([PRIVATE_HTTP_WARNING, ...warnings])
    }
    return store(warnings)
  }, [draft, settings, onSettingsLocal, onSettingsChange])

  const draftPasses = draft.trim() !== "" && isEndpointAllowed(draft.trim()) && !validation.error
  const testBlocker = !draft.trim()
    ? "Enter a server endpoint to test."
    : !draftPasses
      ? "Fix the address above to test."
      : !hasFix
        ? "Needs one recorded location to send. Start tracking first."
        : null

  const handleTestEndpoint = useCallback(async () => {
    Keyboard.dismiss()
    if (testBlocker || !(await commitDraft())) return
    const endpoint = draft.trim()
    setTest({ kind: "testing" })

    try {
      const recentLocation = await NativeLocationService.getMostRecentLocation()
      if (!recentLocation) {
        setTest({ kind: "done", ok: false, status: 0, at: Date.now(), message: "No recorded location to send." })
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
            message: "Local network permission required to reach this server"
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
      if (!result.ok) logger.warn("[ConnectionSettings] Test failed:", result.status, result.errorMessage)
      setTest({
        kind: "done",
        ok: result.ok,
        status: result.status,
        at: Date.now(),
        message: result.ok ? undefined : result.errorMessage || `Server returned ${result.status}`
      })
    } catch (err: any) {
      const msg = err?.message || "Unknown error"
      logger.warn("[ConnectionSettings] Test failed:", err?.name, msg)
      setTest({ kind: "done", ok: false, status: 0, at: Date.now(), message: `Connection failed: ${msg}` })
    }
  }, [testBlocker, commitDraft, draft, settings])

  const example = endpointExample(settings.apiTemplate, settings.dawarichMode)
  const helper = `Example: ${example}. https for public hosts, http only on a private host (192.168.x, 10.x, 172.16-31.x, 100.64.x, localhost). %DATE, %YEAR, %MONTH, %DAY and %TIMESTAMP expand when sending.`
  const ServerGlyph = SERVER_ICONS[server.icon]

  return (
    <View>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Where locations are sent and how the server knows it is you. Changes apply at once.
      </Text>

      <SectionTitle>Server</SectionTitle>
      <Card rows>
        <StateLine
          icon={ServerGlyph}
          iconColor={tone(server.tone)}
          label={server.word}
          caption={server.caption}
          testID="server-state"
        />
        <Divider tight />
        <SettingRow
          label="Offline mode"
          hint="On: locations stay on this device and nothing is sent. Off: they sync to the server below."
        >
          <Toggle
            accessibilityLabel="Offline mode"
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
                  label="Server endpoint"
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
                  title="Test connection"
                  onPress={handleTestEndpoint}
                  disabled={testBlocker !== null}
                  loading={test?.kind === "testing"}
                  testID="test-connection-btn"
                />
                <FieldMessage>
                  {testBlocker ?? "Sends your latest recorded location to this endpoint with your credentials."}
                </FieldMessage>
              </View>

              {test?.kind === "testing" && (
                <StateLine
                  icon={<ActivityIndicator size="small" color={colors.textLight} />}
                  iconColor={colors.textLight}
                  label="Testing"
                  caption="Sending your latest location"
                  testID="test-result"
                />
              )}
              {test?.kind === "done" && (
                <View>
                  <StateLine
                    icon={test.ok ? CircleCheckBig : CircleAlert}
                    iconColor={test.ok ? colors.success : colors.error}
                    label={test.ok ? "Reachable" : "Not reachable"}
                    caption={`${test.status > 0 ? `HTTP ${test.status}` : "No response"} · ${formatTime(Math.floor(test.at / 1000))}`}
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
          <SectionTitle style={styles.groupTop}>Server details</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-request-format"
              icon={Braces}
              label="Request format"
              sub={requestSummary}
              onPress={() => navigation.navigate("Request Format")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-auth-settings"
              icon={KeyRound}
              label="Authentication"
              sub={authSummary}
              onPress={() => navigation.navigate("Auth Settings")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-mtls-settings"
              icon={ShieldCheck}
              label="Client certificate"
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
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  groupTop: {
    marginTop: space.xl
  },
  block: {
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.lg
  }
})
