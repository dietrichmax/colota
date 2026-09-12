/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useRef, useEffect } from "react"
import { Text, StyleSheet, View, ScrollView, DeviceEventEmitter } from "react-native"
import { Archive, Clock, CloudUpload, HardDrive, MapPin, Trash2 } from "lucide-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { DatabaseStats } from "../types/global"
import type { RootScreenProps } from "../types/navigation"
import { useTheme } from "../hooks/useTheme"
import { fonts, fontSizes, lineHeights } from "../styles/typography"
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
  StatRow
} from "../components"
import {
  MANUAL_FLUSH_TIMEOUT_MS,
  RETENTION_PRESET_DAYS,
  RETENTION_PREVIEW_DEBOUNCE_MS,
  SAVE_SUCCESS_DISPLAY_MS,
  space
} from "../constants"
import { useTimeout } from "../hooks/useTimeout"
import { showAlert, showConfirm } from "../services/modalService"
import { allSub, deleteCopy, olderSub, scopeSub, type DataScope } from "../utils/dataScope"
import { parseWholeNumber, wholeNumberError } from "../utils/settingsValidation"
import { formatWhen } from "../utils/geo"
import { logger } from "../utils/logger"

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
  const { colors } = useTheme()
  const { settings, tracking } = useTracking()
  const isOfflineMode = settings.isOfflineMode

  const [stats, setStats] = useState<DatabaseStats>(EMPTY_STATS)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<"count" | "flush" | "compact" | "delete" | null>(null)
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
    ? (wholeNumberError(customText, 1, "day") ??
      (customDays !== null && customDays > MAX_RETENTION_DAYS ? `At most ${MAX_RETENTION_DAYS} days` : undefined))
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
    setClampNote(`Set to ${restored} day${restored === 1 ? "" : "s"}`)
    clampTimeout.set(() => setClampNote(undefined), SAVE_SUCCESS_DISPLAY_MS)
    runPreview(restored)
  }

  /** Every dialog names a count read immediately before it opens, never one held in state. */
  const confirmAndDelete = useCallback(
    async (scope: DataScope, run: () => Promise<number>) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy("count")
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
          showAlert("Nothing to delete", "That count came back empty. The figures above are current.", "info")
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
        showAlert(
          "Delete failed",
          "The database reported an error. Check the figures above before trying again.",
          "error"
        )
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    },
    [days, updateStats, runPreview, applyStats]
  )

  const handleManualFlush = useCallback(async () => {
    if (busyRef.current || stats.queued === 0 || !settings.endpoint) return
    busyRef.current = true
    const queuedBefore = stats.queued
    setBusy("flush")
    setSyncMessage({ text: `Sent 0 of ${queuedBefore.toLocaleString()}.` })

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
      flushTimeout.set(
        () => finish({ text: "No answer from the tracking service. Check the queued count above.", failed: true }),
        MANUAL_FLUSH_TIMEOUT_MS
      )

    const sub = DeviceEventEmitter.addListener(
      "onSyncProgress",
      (event: { sent: number; failed: number; total: number; remaining?: number }) => {
        // Only the event that ends a pass carries `remaining`. A pass caps at a fixed number of
        // batches, so the running count reaching the queue it started with is not the signal.
        if (event.remaining === undefined) {
          armFallback()
          setSyncMessage({ text: `Sent ${event.sent.toLocaleString()} of ${queuedBefore.toLocaleString()}.` })
          return
        }
        // `remaining` is a fresh count of the queue. `failed` counts attempts inside the pass and can
        // exceed it, since a row that failed twice is one row, so it never stands in for the queue.
        const sent = `Sent ${event.sent.toLocaleString()} of ${queuedBefore.toLocaleString()}.`
        const left = event.remaining > 0 ? ` ${event.remaining.toLocaleString()} still queued; press again.` : ""
        if (event.failed > 0) {
          finish({ text: `${sent} Some uploads failed.${left}`, failed: true })
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
      showAlert("Sync failed", "Check your connection settings and try again.", "error")
    }
  }, [stats.queued, settings.endpoint, updateStats, flushTimeout])

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
      setCompactMessage({ text: freed > 0.01 ? `Released ${freed.toFixed(2)} MB` : "Nothing to release" })
      compactTimeout.set(() => setCompactMessage(null), SAVE_SUCCESS_DISPLAY_MS)
    } catch (err) {
      logger.error("[DataManagementScreen] Compact failed:", err)
      showAlert("Could not compact", "The database is busy. Try again in a moment.", "error")
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [compactTimeout, applyStats])

  const syncBlocker = !settings.endpoint
    ? "No server configured. Set one on Connection."
    : stats.queued === 0
      ? stats.lastSyncTime > 0
        ? `Nothing queued. Last upload ${formatWhen(Math.floor(stats.lastSyncTime / 1000))}.`
        : "Nothing queued. New locations upload on their own."
      : null
  const syncIdle = `Uploads the ${stats.queued.toLocaleString()} queued location${stats.queued === 1 ? "" : "s"} now, whatever Sync only on says.${
    tracking ? "" : " The tracking notification appears for a moment. Nothing is recorded."
  }`
  const syncLine = busy === "flush" || syncMessage ? syncMessage : { text: syncBlocker ?? syncIdle }

  const ageCount = preview && preview.days === days ? preview.total : null
  // The field owns its own error; repeating it here would print the same sentence twice.
  const ageLine = ageError
    ? "Fix the age above."
    : days === null
      ? "Choose how old a location must be."
      : ageCount === null
        ? "Counting…"
        : olderSub(ageCount, days, preview?.cutoffSeconds ?? 0)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          What this device is storing, and what deleting it takes away.
        </Text>

        <View style={styles.section}>
          <SectionTitle>Stored on this device</SectionTitle>
          <Card rows>
            <StatRow
              icon={MapPin}
              label="Locations"
              value={loaded ? stats.total.toLocaleString() : "…"}
              testID="stat-locations"
            />
            <Divider tight inset />
            <StatRow
              icon={HardDrive}
              label="Database size"
              value={loaded ? `${stats.databaseSizeMB.toFixed(2)} MB` : "…"}
              testID="stat-size"
            />
          </Card>

          {!isOfflineMode && (
            <View>
              <Button
                variant="secondary"
                title="Sync now"
                testID="sync-now-btn"
                loading={busy === "flush"}
                disabled={isProcessing || syncBlocker !== null}
                onPress={handleManualFlush}
              />
              <FieldMessage variant={syncLine?.failed ? "error" : "info"}>{syncLine?.text ?? ""}</FieldMessage>
            </View>
          )}

          <View>
            <Button
              variant="ghost"
              title="Compact database"
              testID="compact-btn"
              loading={busy === "compact"}
              disabled={isProcessing}
              onPress={handleCompact}
            />
            <FieldMessage>
              {compactMessage?.text ??
                "Rewrites the database to give unused space back. Deleting trips and points leaves gaps that only this reclaims. Nothing is deleted."}
            </FieldMessage>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle>Delete locations</SectionTitle>
          {/* Until the first count lands the screen knows nothing, and "Nothing stored" over a full
              database is both a lie and a whole subtree that mounts only to be torn down again. */}
          {!loaded ? null : stats.total === 0 ? (
            <Card rows style={styles.emptyCard}>
              <EmptyState title="Nothing stored" hint="This device has no locations yet." style={styles.empty} />
            </Card>
          ) : (
            <>
              <Card rows>
                <ListItem
                  testID="nav-backup-restore"
                  icon={Archive}
                  label="Back up first"
                  sub="A backup is the only way to bring any of this back."
                  subLines={2}
                  onPress={() => navigation.navigate("Backup & Restore")}
                />
                {!isOfflineMode && (
                  <>
                    <Divider tight inset />
                    <ListItem
                      testID="delete-queued-row"
                      icon={Clock}
                      trailingIcon={Trash2}
                      label="Delete queued locations"
                      sub={scopeSub("queued", stats.queued)}
                      subLines={2}
                      disabled={isProcessing || stats.queued === 0}
                      accessibilityHint="Asks you to confirm, then deletes"
                      onPress={() => confirmAndDelete("queued", () => NativeLocationService.clearQueue())}
                    />
                    <Divider tight inset />
                    <ListItem
                      testID="delete-synced-row"
                      icon={CloudUpload}
                      trailingIcon={Trash2}
                      label="Delete synced locations"
                      sub={scopeSub("synced", stats.sent)}
                      subLines={2}
                      disabled={isProcessing || stats.sent === 0}
                      accessibilityHint="Asks you to confirm, then deletes"
                      onPress={() => confirmAndDelete("synced", () => NativeLocationService.clearSentHistory())}
                    />
                  </>
                )}
              </Card>

              <Card style={styles.ageCard}>
                <ChipGroup
                  accessibilityLabel="Age"
                  options={[
                    ...RETENTION_PRESET_DAYS.map((preset) => ({
                      value: String(preset),
                      label: preset === 365 ? "1 year" : `${preset} days`,
                      testID: `age-${preset}`
                    })),
                    { value: "custom", label: "Custom", testID: "age-custom" }
                  ]}
                  selected={ageChoice}
                  onSelect={handleAgeChoice}
                />
                {isCustom && (
                  <View style={styles.customField}>
                    <NumericInput
                      label="Delete locations older than"
                      testID="retention-days-input"
                      value={customText}
                      onChange={handleCustomChange}
                      onBlur={handleCustomBlur}
                      unit="days"
                      placeholder={String(PLACEHOLDER_DAYS)}
                      hint="At least 1 day."
                      error={ageError}
                      message={clampNote}
                    />
                  </View>
                )}
              </Card>

              <View>
                <Button
                  variant="ghost"
                  color={colors.error}
                  icon={Trash2}
                  testID="delete-older-btn"
                  title={
                    ageCount && ageCount > 0
                      ? `Delete ${ageCount.toLocaleString()} location${ageCount === 1 ? "" : "s"}`
                      : "Delete older locations"
                  }
                  loading={busy === "count" || busy === "delete"}
                  disabled={isProcessing || !!ageError || days === null || !ageCount}
                  onPress={() => confirmAndDelete("older", () => NativeLocationService.deleteOlderThan(days as number))}
                />
                <FieldMessage variant={ageError ? "error" : "info"}>{ageLine}</FieldMessage>
              </View>

              <View>
                <Button
                  variant="danger"
                  icon={Trash2}
                  title="Delete all locations"
                  testID="delete-all-btn"
                  loading={busy === "count" || busy === "delete"}
                  disabled={isProcessing}
                  onPress={() => confirmAndDelete("all", () => NativeLocationService.clearAllLocations())}
                />
                <FieldMessage>{allSub(stats.total)}</FieldMessage>
              </View>
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
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  section: {
    marginBottom: space.xl
  },
  ageCard: {
    marginTop: space.md
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
