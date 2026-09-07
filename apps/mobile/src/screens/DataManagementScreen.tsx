/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useRef } from "react"
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  NativeEventEmitter,
  NativeModules
} from "react-native"
import { Lightbulb } from "lucide-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { ScreenProps, DatabaseStats } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { fonts, fontSizes, lineHeights } from "../styles/typography"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { Button, Card, Container, Divider, FloatingSaveIndicator, SectionTitle, StatRow, TextField } from "../components"
import { SAVE_SUCCESS_DISPLAY_MS, STATS_REFRESH_FAST, size, space } from "../constants"
import { useTimeout } from "../hooks/useTimeout"
import { showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"

const BACKUP_TIP = "Tip: back up your data first (Settings -> Backup & Restore)."

export function DataManagementScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const isOfflineMode = settings.isOfflineMode

  const [stats, setStats] = useState<DatabaseStats>({
    queued: 0,
    sent: 0,
    total: 0,
    today: 0,
    databaseSizeMB: 0
  })

  const [daysInput, setDaysInput] = useState("90")
  const [isProcessing, setIsProcessing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const feedbackTimeout = useTimeout()

  // Update stats
  const updateStats = useCallback(async () => {
    try {
      const nativeStats = await NativeLocationService.getStats()
      setStats(nativeStats)
    } catch (err) {
      logger.error("[DataManagementScreen] Failed to update stats:", err)
    }
  }, [])

  // Load debug mode setting
  useFocusEffect(
    useCallback(() => {
      updateStats()
      const interval = setInterval(updateStats, STATS_REFRESH_FAST)
      return () => clearInterval(interval)
    }, [updateStats])
  )

  // Show feedback message
  const showFeedback = useCallback(
    (message: string, duration = SAVE_SUCCESS_DISPLAY_MS) => {
      setFeedback(message)
      feedbackTimeout.set(() => setFeedback(null), duration)
    },
    [feedbackTimeout]
  )

  // Manual flush with progress
  const progressListenerRef = useRef<any>(null)
  const syncEmitter = useRef(new NativeEventEmitter(NativeModules.LocationServiceModule)).current
  const flushTimeout = useTimeout()

  const cleanupFlush = useCallback(async () => {
    progressListenerRef.current?.remove()
    progressListenerRef.current = null
    flushTimeout.clear()
    await updateStats()
    setIsProcessing(false)
  }, [updateStats, flushTimeout])

  const handleManualFlush = useCallback(async () => {
    if (isProcessing || stats.queued === 0) return
    const total = stats.queued

    try {
      setIsProcessing(true)
      setFeedback(`Syncing 0/${total}...`)
      feedbackTimeout.clear()

      const receivedProgress = { current: false }

      progressListenerRef.current = syncEmitter.addListener("onSyncProgress", (rawEvent: any) => {
        const event = rawEvent as { sent: number; failed: number; total: number }
        receivedProgress.current = true
        const processed = event.sent + event.failed
        if (processed >= event.total) {
          // Sync finished - show final result, then clean up
          const msg =
            event.failed > 0
              ? `Synced ${event.sent}/${event.total} (${event.failed} failed)`
              : `Synced ${event.sent}/${event.total}`
          setFeedback(msg)
          flushTimeout.set(async () => {
            await cleanupFlush()
            showFeedback("Sync complete")
          }, 1500)
        } else {
          setFeedback(`Syncing ${processed}/${event.total}...`)
        }
      })

      // manualFlush is fire-and-forget; fall back after 30s if no progress events arrive
      await NativeLocationService.manualFlush()
      flushTimeout.set(async () => {
        await cleanupFlush()
        showFeedback(receivedProgress.current ? "Sync complete" : "Sync failed! Check connection")
      }, 30000)
    } catch (err) {
      logger.error("[DataManagementScreen] Manual flush error:", err)
      await cleanupFlush()
      showFeedback("Sync failed. Check your connection and endpoint.")
    }
  }, [stats.queued, isProcessing, showFeedback, feedbackTimeout, flushTimeout, syncEmitter, cleanupFlush])

  // Generic delete handler
  const handleDeleteAction = useCallback(
    async (action: () => Promise<number | void>, successMessage: (count: number) => string) => {
      setIsProcessing(true)
      try {
        const deleted = await action()
        await updateStats()
        if (typeof deleted === "number") {
          showFeedback(successMessage(deleted))
        }
      } catch (err) {
        logger.error("[DataManagementScreen] Delete action failed:", err)
        showFeedback("Action failed")
      } finally {
        setIsProcessing(false)
      }
    },
    [updateStats, showFeedback]
  )

  const handleClearSentHistory = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "Clear sent history",
      message: `Delete ${stats.sent} sent location${stats.sent !== 1 ? "s" : ""}? This cannot be undone.\n\n${BACKUP_TIP}`,
      confirmText: "Clear",
      destructive: true
    })
    if (!confirmed) return

    handleDeleteAction(
      () => NativeLocationService.clearSentHistory().then(() => stats.sent),
      (count) => `Cleared ${count} sent location${count !== 1 ? "s" : ""}`
    )
  }, [handleDeleteAction, stats.sent])

  const handleClearQueue = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "Clear queue",
      message: `Delete ${stats.queued} pending location${stats.queued !== 1 ? "s" : ""}? These will not be synced.\n\n${BACKUP_TIP}`,
      confirmText: "Clear",
      destructive: true
    })
    if (!confirmed) return

    handleDeleteAction(
      () => NativeLocationService.clearQueue(),
      (count) => `Cleared ${count} queued location${count !== 1 ? "s" : ""}`
    )
  }, [handleDeleteAction, stats.queued])

  const handleDeleteAllLocations = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "Delete all locations",
      message: `Delete all ${stats.total} stored location${stats.total !== 1 ? "s" : ""}? This cannot be undone.\n\n${BACKUP_TIP}`,
      confirmText: "Delete all",
      destructive: true
    })
    if (!confirmed) return

    handleDeleteAction(
      () => NativeLocationService.clearAllLocations(),
      (count) => `Deleted ${count} location${count !== 1 ? "s" : ""}`
    )
  }, [handleDeleteAction, stats.total])

  const handleDeleteOlderThan = useCallback(async () => {
    const days = parseInt(daysInput, 10)
    if (isNaN(days) || days <= 0) {
      showFeedback("Please enter a valid number of days")
      return
    }

    const confirmed = await showConfirm({
      title: "Delete old locations",
      message: `Delete all locations older than ${days} day${days !== 1 ? "s" : ""}? This cannot be undone.\n\n${BACKUP_TIP}`,
      confirmText: "Delete",
      destructive: true
    })
    if (!confirmed) return

    handleDeleteAction(
      () => NativeLocationService.deleteOlderThan(days),
      (count) => `Deleted ${count} location${count !== 1 ? "s" : ""} older than ${days} day${days !== 1 ? "s" : ""}`
    )
  }, [daysInput, handleDeleteAction, showFeedback])

  const handleVacuum = useCallback(async () => {
    setIsProcessing(true)
    try {
      const sizeBefore = stats.databaseSizeMB
      await NativeLocationService.vacuumDatabase()
      const freshStats = await NativeLocationService.getStats()
      setStats(freshStats)
      const freed = sizeBefore - freshStats.databaseSizeMB
      if (freed > 0.01) {
        showFeedback(`Freed ${freed.toFixed(2)} MB`)
      } else {
        showFeedback("Database already optimized")
      }
    } catch (err) {
      logger.error("[DataManagementScreen] Vacuum failed:", err)
      showFeedback("Optimization failed")
    } finally {
      setIsProcessing(false)
    }
  }, [stats.databaseSizeMB, showFeedback])

  return (
    <Container>
      <KeyboardAvoidingView style={styles.keyboardAvoid} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            What this device is storing, and how to clear it
          </Text>
          {/* Stats */}
          <View style={styles.section}>
            <SectionTitle>Database statistics</SectionTitle>
            <Card>
              {[
                ["Total locations", stats.total.toLocaleString()],
                ...(!isOfflineMode
                  ? [
                      ["Sent", stats.sent.toLocaleString()],
                      ["Queued", stats.queued.toLocaleString()]
                    ]
                  : []),
                ["Today", stats.today.toLocaleString()],
                ["Storage", `${stats.databaseSizeMB.toFixed(2)} MB`]
              ].map(([label, value], i, arr) => (
                <React.Fragment key={i}>
                  <StatRow label={label} value={value} />
                  {i < arr.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </Card>
          </View>

          {/* Queue Actions */}
          {!isOfflineMode && (
            <View style={styles.section}>
              <SectionTitle>Queue actions</SectionTitle>
              <Card>
                <Button onPress={handleManualFlush} disabled={isProcessing || stats.queued === 0} title="Sync now" />
                <Text style={[styles.hint, { color: colors.textLight }]}>
                  {stats.queued === 0
                    ? "Queue is empty"
                    : `Trigger immediate sync of ${stats.queued} queued location${stats.queued !== 1 ? "s" : ""}`}
                </Text>
              </Card>
            </View>
          )}

          {/* Cleanup Actions */}
          <View style={styles.section}>
            <SectionTitle>Cleanup actions</SectionTitle>
            <Card>
              {!isOfflineMode ? (
                <>
                  {/* Clear Sent History */}
                  <ActionRow
                    label="Clear sent history"
                    hint="Delete all successfully sent locations"
                    value={stats.sent.toLocaleString()}
                    onPress={handleClearSentHistory}
                    disabled={isProcessing || stats.sent === 0}
                  />
                  <Divider />

                  {/* Clear Queue */}
                  <ActionRow
                    label="Clear queue"
                    hint="Delete all pending locations"
                    value={stats.queued.toLocaleString()}
                    onPress={handleClearQueue}
                    disabled={isProcessing || stats.queued === 0}
                  />
                  <Divider />
                </>
              ) : (
                <>
                  {/* Delete All Locations (offline mode) */}
                  <ActionRow
                    label="Delete all locations"
                    hint="Remove all stored locations from the database"
                    value={stats.total.toLocaleString()}
                    onPress={handleDeleteAllLocations}
                    disabled={isProcessing || stats.total === 0}
                  />
                  <Divider />
                </>
              )}

              {/* Delete Older Than */}
              <View style={styles.actionColumn}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Delete old locations</Text>
                <Text style={[styles.actionHint, { color: colors.textLight }]}>
                  Remove locations older than specified days
                </Text>
                <View style={styles.daysInputRow}>
                  <TextField
                    testID="retention-days-input"
                    accessibilityLabel="Days to keep"
                    figure
                    style={styles.daysInput}
                    keyboardType="numeric"
                    value={daysInput}
                    onChangeText={setDaysInput}
                    placeholder="90"
                  />
                  <Text style={[styles.daysLabel, { color: colors.textSecondary }]}>days</Text>
                  <Button
                    testID="delete-older-btn"
                    onPress={handleDeleteOlderThan}
                    disabled={isProcessing}
                    title="Delete"
                    variant="danger"
                  />
                </View>
              </View>
              <Divider />

              {/* Vacuum */}
              <View style={styles.actionColumn}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Optimize database</Text>
                <Text style={[styles.actionHint, { color: colors.textLight }]}>
                  Reclaim unused space and improve performance
                </Text>
                <View style={styles.hintRow}>
                  <Lightbulb size={size.icon.sm} color={colors.textLight} />
                  <Text style={[styles.actionHint, { color: colors.textLight }]}>
                    Run after large deletions to reclaim space
                  </Text>
                </View>
                <Button onPress={handleVacuum} disabled={isProcessing} title="Optimize" variant="secondary" />
              </View>
            </Card>
          </View>
        </ScrollView>

        {/* Floating Feedback */}
        <FloatingSaveIndicator
          saving={isProcessing}
          message={feedback}
          isError={feedback?.toLowerCase().includes("failed") ?? false}
          colors={colors}
        />
      </KeyboardAvoidingView>
    </Container>
  )
}

const ActionRow = ({
  label,
  hint,
  value,
  onPress,
  disabled
}: {
  label: string
  hint: string
  value: string
  onPress: () => void
  disabled: boolean
}) => {
  const { colors } = useTheme()

  return (
    <Pressable
      style={({ pressed }) => [styles.actionRow, pressed && { opacity: colors.pressedOpacity }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`${label}, ${value}. ${hint}`}
    >
      <View style={styles.actionInfo}>
        <Text style={[styles.actionLabel, { color: disabled ? colors.textDisabled : colors.error }]}>{label}</Text>
        <Text style={[styles.actionHint, { color: disabled ? colors.textDisabled : colors.textLight }]}>{hint}</Text>
      </View>
      <Text style={[styles.actionCount, { color: disabled ? colors.textDisabled : colors.textSecondary }]}>
        {value}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  keyboardAvoid: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl
  },
  section: {
    marginBottom: space.xl
  },
  hint: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    textAlign: "center",
    lineHeight: lineHeights.caption,
    marginTop: space.sm
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md
  },
  actionColumn: {
    paddingVertical: space.md
  },
  actionInfo: {
    flex: 1
  },
  actionLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: space.xs
  },
  actionHint: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    lineHeight: lineHeights.caption,
    marginTop: 2
  },
  actionCount: {
    fontSize: fontSizes.description,
    ...fonts.medium,
    fontVariant: ["tabular-nums"]
  },
  daysInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: space.md,
    gap: space.sm
  },
  daysInput: {
    flex: 1
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: 2
  },
  daysLabel: {
    fontSize: fontSizes.input,
    ...fonts.medium
  }
})
