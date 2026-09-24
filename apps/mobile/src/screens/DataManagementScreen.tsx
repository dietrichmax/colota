/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useRef, useEffect } from "react"
import { StyleSheet, View, ScrollView, DeviceEventEmitter } from "react-native"
import { Archive, CalendarRange, Clock, CloudUpload, HardDrive, MapPin, Minimize2, Trash2 } from "lucide-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { DatabaseStats } from "../types/global"
import type { RootScreenProps } from "../types/navigation"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import {
  Button,
  Card,
  ChipGroup,
  Container,
  Divider,
  EmptyState,
  FieldMessage,
  ListItem,
  NumericInput,
  SectionTitle,
  SpinningLoader,
  StatRow
} from "../components"
import {
  MANUAL_FLUSH_TIMEOUT_MS,
  RETENTION_PRESET_DAYS,
  RETENTION_PREVIEW_DEBOUNCE_MS,
  SAVE_SUCCESS_DISPLAY_MS,
  size,
  space
} from "../constants"
import { useTimeout } from "../hooks/useTimeout"
import { showAlert, showConfirm } from "../services/modalService"
import { deleteCopy, olderSub, scopeSub, type DataScope } from "../utils/dataScope"
import { parseWholeNumber, wholeNumberError } from "../utils/settingsValidation"
import { formatWhen } from "../utils/geo"
import { logger } from "../utils/logger"
import { formatBytes } from "../utils/format"
import { useTranslation } from "../i18n/useTranslation"

/** Only a placeholder in the custom field. Nothing is selected until the user selects it. */
const PLACEHOLDER_DAYS = 90

/** A hundred years. Past this the value stops being an age and starts being a typo. */
const MAX_RETENTION_DAYS = 36500

type Message = { text: string; failed?: boolean }
type Preview = { days: number; total: number; cutoffSeconds: number } | null

const EMPTY_STATS: DatabaseStats = {
  queued: 0,
  sent: 0,
  total: 0,
  today: 0,
  databaseSizeMB: 0,
  lastSyncTime: 0,
  lastSyncError: ""
}

export function DataManagementScreen({ navigation }: RootScreenProps<"Data Management">) {
  const { t } = useTranslation()
  const { settings } = useTracking()
  const isOfflineMode = settings.isOfflineMode

  const [stats, setStats] = useState<DatabaseStats>(EMPTY_STATS)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<"count" | "flush" | "compact" | "delete" | null>(null)
  const [busyScope, setBusyScope] = useState<DataScope | null>(null)
  const [syncMessage, setSyncMessage] = useState<Message | null>(null)
  const [compactMessage, setCompactMessage] = useState<Message | null>(null)

  // Nothing preselected: an age is an argument to a delete, so the screen opens with none chosen,
  // arms nothing and counts nothing until the user picks one.
  const [ageChoice, setAgeChoice] = useState("")
  const [customText, setCustomText] = useState("")
  const lastValidDays = useRef<number | null>(null)
  const [clampNote, setClampNote] = useState<string | undefined>()
  const [preview, setPreview] = useState<Preview>(null)

  const compactTimeout = useTimeout()
  const clampTimeout = useTimeout()
  const previewTimeout = useTimeout()
  const flushTimeout = useTimeout()

  // A ref, not the state, because two presses inside one render both read the same state value.
  const busyRef = useRef(false)
  const isProcessing = busy !== null

  const statsIssued = useRef(0)
  const statsApplied = useRef(0)
  // The flush listener lives outside any effect, so only this removes it when the screen goes.
  const flushSub = useRef<{ remove: () => void } | null>(null)
  useEffect(() => () => flushSub.current?.remove(), [])

  /**
   * Reads are numbered so a slow earlier one cannot land on a newer one. The comparison is against
   * what has landed, not against what has been issued, or a newer read that then fails would leave
   * the screen with nothing applied and the ledger stuck on its placeholder.
   */
  const applyStats = useCallback((next: DatabaseStats, generation: number) => {
    if (generation < statsApplied.current) return
    statsApplied.current = generation
    setStats(next)
    setLoaded(true)
  }, [])

  const updateStats = useCallback(async () => {
    const generation = ++statsIssued.current
    try {
      applyStats(await NativeLocationService.getStats(), generation)
    } catch (err) {
      logger.error("[DataManagementScreen] Failed to update stats:", err)
    }
  }, [applyStats])

  const isCustom = ageChoice === "custom"
  const customDays = parseWholeNumber(customText)
  const days = isCustom ? customDays : parseWholeNumber(ageChoice)
  // The bridge parameter is a Kotlin Int, so an age past its range would arrive coerced and could
  // put the cutoff in the future, where every row matches.
  const ageError = isCustom
    ? (wholeNumberError(customText, 1, t("unit.day")) ??
      (customDays !== null && customDays > MAX_RETENTION_DAYS
        ? t("data.atMost", { n: MAX_RETENTION_DAYS })
        : undefined))
    : undefined

  /** One count per settled age, from the same cutoff arithmetic the delete uses. */
  const runPreview = useCallback(
    (forDays: number | null) => {
      previewTimeout.clear()
      if (forDays === null || forDays < 1) {
        setPreview(null)
        return
      }
      if (forDays > MAX_RETENTION_DAYS) {
        setPreview(null)
        return
      }
      previewTimeout.set(async () => {
        // An age the user settled on long enough to have it counted. Recording per keystroke would
        // catch every prefix, so backspacing 365 to nothing would restore 3 and arm a far wider delete.
        lastValidDays.current = forDays
        try {
          const { total, cutoffSeconds } = await NativeLocationService.countOlderThan(forDays)
          setPreview({ days: forDays, total, cutoffSeconds })
        } catch (err) {
          logger.error("[DataManagementScreen] Failed to count old locations:", err)
          setPreview(null)
        }
      }, RETENTION_PREVIEW_DEBOUNCE_MS)
    },
    [previewTimeout]
  )

  // No preview call here. This callback is stable, so it would capture the age from the first
  // render, which is always none, and re-focusing would wipe a count the user had already asked for.
  // The preview runs from the controls that change the age.
  useFocusEffect(
    useCallback(() => {
      updateStats()
      const subs = ["onSyncProgress", "onSyncError", "onLocationUpdate", "onDatabaseCompacted"].map((event) =>
        DeviceEventEmitter.addListener(event, updateStats)
      )
      return () => subs.forEach((s) => s.remove())
    }, [updateStats])
  )

  const handleAgeChoice = (value: string) => {
    setAgeChoice(value)
    setClampNote(undefined)
    runPreview(value === "custom" ? customDays : parseWholeNumber(value))
  }

  const handleCustomChange = (text: string) => {
    setCustomText(text)
    setClampNote(undefined)
    const parsed = parseWholeNumber(text)
    runPreview(parsed !== null && parsed >= 1 ? parsed : null)
  }

  // The siblings clamp an emptied field up to the minimum, which is right for a stored setting.
  // Here the value is a delete argument: clamping to 1 would arm "delete everything older than a
  // day" in silence, so an invalid entry falls back to the last age the user actually chose.
  const handleCustomBlur = () => {
    if (customDays !== null && customDays >= 1) {
      lastValidDays.current = customDays
      return
    }
    const restored = lastValidDays.current
    // Nothing settled yet, so there is nothing to fall back to. The field stays empty and the
    // delete stays disarmed, which is the right resting state for a delete argument.
    if (restored === null) return
    setCustomText(String(restored))
    setClampNote(t("data.setTo", { count: restored, n: restored }))
    clampTimeout.set(() => setClampNote(undefined), SAVE_SUCCESS_DISPLAY_MS)
    runPreview(restored)
  }

  /** Every dialog names a count read immediately before it opens, never one held in state. */
  const confirmAndDelete = useCallback(
    async (scope: DataScope, run: () => Promise<number>) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy("count")
      setBusyScope(scope)
      try {
        const generation = ++statsIssued.current
        const fresh = await NativeLocationService.getStats()
        applyStats(fresh, generation)
        let count = fresh.total
        let older
        if (scope === "queued") count = fresh.queued
        if (scope === "synced") count = fresh.sent
        if (scope === "older") {
          if (days === null) return
          const { total, cutoffSeconds } = await NativeLocationService.countOlderThan(days)
          count = total
          // Reads every match, so it is taken here and nowhere on the way here.
          const unsent = total === 0 ? 0 : await NativeLocationService.countUnsentOlderThan(days)
          older = { days, unsent, cutoffSeconds }
        }
        if (count === 0) {
          showAlert(t("data.nothingToDelete.title"), t("data.nothingToDelete.message"), "info")
          return
        }

        const copy = deleteCopy(scope, count, older)
        if (!(await showConfirm({ ...copy, destructive: true }))) return

        setBusy("delete")
        await run()
        await updateStats()
        runPreview(days)
      } catch (err) {
        logger.error(`[DataManagementScreen] Failed to delete ${scope} locations:`, err)
        showAlert(t("data.deleteFailed.title"), t("data.deleteFailed.message"), "error")
      } finally {
        busyRef.current = false
        setBusy(null)
        setBusyScope(null)
      }
    },
    [days, updateStats, runPreview, applyStats, t]
  )

  const handleManualFlush = useCallback(async () => {
    if (busyRef.current || stats.queued === 0 || !settings.endpoint) return
    busyRef.current = true
    const queuedBefore = stats.queued
    setBusy("flush")
    setSyncMessage({ text: t("data.sync.progress", { sent: 0, total: queuedBefore.toLocaleString() }) })

    const finish = async (message: Message) => {
      flushTimeout.clear()
      sub.remove()
      flushSub.current = null
      await updateStats()
      setSyncMessage(message)
      busyRef.current = false
      setBusy(null)
    }

    // The fallback means no event for this long, not no ending within this long of the press. A pass
    // over a large queue outlives the window while still reporting, and declaring it dead would
    // remove the listener and re-enable the button over a run that is still uploading.
    const armFallback = () =>
      flushTimeout.set(() => finish({ text: t("data.sync.noAnswer"), failed: true }), MANUAL_FLUSH_TIMEOUT_MS)

    const sub = DeviceEventEmitter.addListener(
      "onSyncProgress",
      (event: { sent: number; failed: number; total: number; remaining?: number }) => {
        // Only the event that ends a pass carries `remaining`. A pass caps at a fixed number of
        // batches, so the running count reaching the queue it started with is not the signal.
        if (event.remaining === undefined) {
          armFallback()
          setSyncMessage({
            text: t("data.sync.progress", { sent: event.sent.toLocaleString(), total: queuedBefore.toLocaleString() })
          })
          return
        }
        // `remaining` is a fresh count of the queue. `failed` counts attempts inside the pass and can
        // exceed it, since a row that failed twice is one row, so it never stands in for the queue.
        const sent = t("data.sync.progress", {
          sent: event.sent.toLocaleString(),
          total: queuedBefore.toLocaleString()
        })
        const left =
          event.remaining > 0 ? ` ${t("data.sync.stillQueued", { n: event.remaining.toLocaleString() })}` : ""
        if (event.failed > 0) {
          finish({ text: `${sent} ${t("data.sync.someFailed")}${left}`, failed: true })
        } else {
          finish({ text: `${sent}${left}` })
        }
      }
    )

    flushSub.current = sub

    try {
      await NativeLocationService.manualFlush()
      armFallback()
    } catch (err) {
      logger.error("[DataManagementScreen] Manual flush failed:", err)
      flushTimeout.clear()
      sub.remove()
      flushSub.current = null
      busyRef.current = false
      setBusy(null)
      setSyncMessage(null)
      showAlert(t("data.sync.failed.title"), t("data.sync.failed.message"), "error")
    }
  }, [stats.queued, settings.endpoint, updateStats, flushTimeout, t])

  const handleCompact = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy("compact")
    try {
      // Both figures come from the same moment, and both go through the generation guard so a read
      // issued before the rewrite cannot land after it and put the old size back.
      const beforeGeneration = ++statsIssued.current
      const beforeStats = await NativeLocationService.getStats()
      applyStats(beforeStats, beforeGeneration)
      const before = beforeStats.databaseSizeMB
      await NativeLocationService.vacuumDatabase()
      const afterGeneration = ++statsIssued.current
      const after = await NativeLocationService.getStats()
      applyStats(after, afterGeneration)
      const freed = before - after.databaseSizeMB
      setCompactMessage({
        text:
          freed > 0.01
            ? t("data.compact.released", { size: formatBytes(freed * 1024 * 1024, { decimals: 0 }) })
            : t("data.compact.nothing")
      })
      compactTimeout.set(() => setCompactMessage(null), SAVE_SUCCESS_DISPLAY_MS)
    } catch (err) {
      logger.error("[DataManagementScreen] Compact failed:", err)
      showAlert(t("data.compact.failed.title"), t("data.compact.failed.message"), "error")
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [compactTimeout, applyStats, t])

  const syncBlocker = !settings.endpoint
    ? t("data.sync.noServer")
    : stats.queued === 0
      ? stats.lastSyncTime > 0
        ? t("data.sync.nothingLast", { when: formatWhen(Math.floor(stats.lastSyncTime / 1000)) })
        : t("data.sync.nothingAuto")
      : null
  const syncIdle = t("data.syncIdle", { count: stats.queued, n: stats.queued.toLocaleString() })
  const syncSub = busy === "flush" ? (syncMessage?.text ?? "") : (syncBlocker ?? syncIdle)
  const syncResult = busy === "flush" ? null : syncMessage
  const scopeProgress = (scope: DataScope) =>
    busyScope === scope ? (busy === "delete" ? t("data.deleting") : t("data.counting")) : null

  const ageCount = preview && preview.days === days ? preview.total : null
  // The field owns its own error; repeating it here would print the same sentence twice.
  const ageLine = ageError
    ? t("data.age.fix")
    : days === null
      ? t("data.age.choose")
      : ageCount === null
        ? t("data.counting")
        : olderSub(ageCount, days, preview?.cutoffSeconds ?? 0)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <SectionTitle>{t("data.section.stored")}</SectionTitle>
          <Card rows>
            <StatRow
              icon={MapPin}
              label={t("data.stat.locations")}
              value={loaded ? stats.total.toLocaleString() : "…"}
              testID="stat-locations"
            />
            <Divider tight inset />
            <StatRow
              icon={HardDrive}
              label={t("data.stat.size")}
              value={loaded ? formatBytes(stats.databaseSizeMB * 1024 * 1024, { decimals: 0 }) : "…"}
              testID="stat-size"
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>{t("data.section.maintenance")}</SectionTitle>
          <Card rows>
            {!isOfflineMode && (
              <>
                <ListItem
                  testID="sync-now-row"
                  icon={Clock}
                  trailingIcon={busy === "flush" ? SpinningLoader : CloudUpload}
                  label={t("data.syncNow")}
                  sub={syncSub}
                  subLines={2}
                  disabled={busy === "flush" ? false : isProcessing || syncBlocker !== null}
                  accessibilityHint={t("data.syncNow.hint")}
                  onPress={handleManualFlush}
                />
                <Divider tight inset />
              </>
            )}
            <ListItem
              testID="compact-row"
              icon={HardDrive}
              trailingIcon={busy === "compact" ? SpinningLoader : Minimize2}
              label={t("data.compact")}
              sub={busy === "compact" ? t("data.compact.running") : t("data.compact.sub")}
              subLines={2}
              disabled={busy === "compact" ? false : isProcessing}
              accessibilityHint={t("data.compact.hint")}
              onPress={handleCompact}
            />
          </Card>
          {syncResult ? (
            <FieldMessage variant={syncResult.failed ? "error" : "info"}>{syncResult.text}</FieldMessage>
          ) : null}
          {compactMessage ? <FieldMessage>{compactMessage.text}</FieldMessage> : null}
        </View>

        <View style={styles.section}>
          <SectionTitle>{t("data.section.delete")}</SectionTitle>
          {/* Until the first count lands the screen knows nothing, and "Nothing stored" over a full
              database is both a lie and a whole subtree that mounts only to be torn down again. */}
          {!loaded ? null : stats.total === 0 ? (
            <Card rows style={styles.emptyCard}>
              <EmptyState title={t("data.empty.title")} hint={t("data.empty.hint")} style={styles.empty} />
            </Card>
          ) : (
            <>
              <Card rows>
                <ListItem
                  testID="nav-backup-restore"
                  icon={Archive}
                  label={t("data.backupFirst")}
                  sub={t("data.backupFirst.sub")}
                  subLines={2}
                  onPress={() => navigation.navigate("Backup & Restore")}
                />
                {!isOfflineMode && (
                  <>
                    <Divider tight inset />
                    <ListItem
                      testID="delete-queued-row"
                      icon={Clock}
                      trailingIcon={busyScope === "queued" ? SpinningLoader : Trash2}
                      label={t("data.deleteQueued")}
                      sub={scopeProgress("queued") ?? scopeSub("queued", stats.queued)}
                      subLines={2}
                      disabled={busyScope === "queued" ? false : isProcessing || stats.queued === 0}
                      accessibilityHint={t("data.confirmThenDelete")}
                      onPress={() => confirmAndDelete("queued", () => NativeLocationService.clearQueue())}
                    />
                    <Divider tight inset />
                    <ListItem
                      testID="delete-synced-row"
                      icon={CloudUpload}
                      trailingIcon={busyScope === "synced" ? SpinningLoader : Trash2}
                      label={t("data.deleteSynced")}
                      sub={scopeProgress("synced") ?? scopeSub("synced", stats.sent)}
                      subLines={2}
                      disabled={busyScope === "synced" ? false : isProcessing || stats.sent === 0}
                      accessibilityHint={t("data.confirmThenDelete")}
                      onPress={() => confirmAndDelete("synced", () => NativeLocationService.clearSentHistory())}
                    />
                  </>
                )}
                <Divider tight inset />
                <ListItem
                  testID="delete-older-row"
                  icon={CalendarRange}
                  trailingIcon={busyScope === "older" ? SpinningLoader : Trash2}
                  label={t("data.deleteOlder")}
                  sub={scopeProgress("older") ?? ageLine}
                  subLines={2}
                  disabled={busyScope === "older" ? false : isProcessing || !!ageError || days === null || !ageCount}
                  accessibilityHint={t("data.confirmThenDelete")}
                  onPress={() => confirmAndDelete("older", () => NativeLocationService.deleteOlderThan(days as number))}
                />
                <View style={styles.ageControls}>
                  <ChipGroup
                    accessibilityLabel={t("data.age")}
                    options={[
                      ...RETENTION_PRESET_DAYS.map((preset) => ({
                        value: String(preset),
                        label: preset === 365 ? t("data.age.year") : t("data.age.days", { count: preset, n: preset }),
                        testID: `age-${preset}`
                      })),
                      { value: "custom", label: t("common.custom"), testID: "age-custom" }
                    ]}
                    selected={ageChoice}
                    onSelect={handleAgeChoice}
                  />
                  {isCustom && (
                    <View style={styles.customField}>
                      <NumericInput
                        label={t("data.olderThan")}
                        testID="retention-days-input"
                        value={customText}
                        onChange={handleCustomChange}
                        onBlur={handleCustomBlur}
                        unit={t("unit.days")}
                        placeholder={String(PLACEHOLDER_DAYS)}
                        hint={t("data.olderThan.hint")}
                        error={ageError}
                        message={clampNote}
                      />
                    </View>
                  )}
                </View>
              </Card>

              <Button
                variant="danger"
                icon={Trash2}
                title={t("data.deleteAll")}
                testID="delete-all-btn"
                loading={busyScope === "all"}
                disabled={isProcessing}
                onPress={() => confirmAndDelete("all", () => NativeLocationService.clearAllLocations())}
              />
            </>
          )}
        </View>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  section: {
    marginBottom: space.xl
  },
  ageControls: {
    marginTop: -space.xs,
    paddingStart: size.icon.md + space.lg,
    paddingBottom: space.lg
  },
  customField: {
    marginTop: space.lg
  },
  emptyCard: {
    paddingVertical: space.lg
  },
  empty: {
    paddingHorizontal: 0
  }
})
