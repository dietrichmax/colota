/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback } from "react"
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from "react-native"
import { Lightbulb } from "lucide-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { ScreenProps, DatabaseStats } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { fonts, fontSizes } from "../styles/typography"
import NativeLocationService from "../services/NativeLocationService"
import { Button, SectionTitle, Card, Container, Divider, FloatingSaveIndicator } from "../components"
import { STATS_REFRESH_FAST } from "../constants"
import { useTimeout } from "../hooks/useTimeout"
import { logger } from "../utils/logger"

export function DataManagementScreen({}: ScreenProps) {
  const { colors } = useTheme()

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

  // Auto-refresh stats when screen is focused
  useFocusEffect(
    useCallback(() => {
      updateStats()
      const interval = setInterval(updateStats, STATS_REFRESH_FAST)
      return () => clearInterval(interval)
    }, [updateStats])
  )

  // Show feedback message
  const showFeedback = useCallback(
    (message: string, duration = 2000) => {
      setFeedback(message)
      feedbackTimeout.set(() => setFeedback(null), duration)
    },
    [feedbackTimeout]
  )

  // Manual flush
  const handleManualFlush = useCallback(async () => {
    if (isProcessing || stats.queued === 0) return

    try {
      setIsProcessing(true)
      showFeedback("Syncing locations...", 30000) // Long timeout

      await NativeLocationService.manualFlush()

      // Wait a bit for the sync to start, then update stats
      setTimeout(async () => {
        await updateStats()
        setIsProcessing(false)
        showFeedback("Sync initiated successfully!")
      }, 2000)
    } catch (err) {
      logger.error("[DataManagementScreen] Manual flush error:", err)
      setIsProcessing(false)
      showFeedback("Failed to sync queue")
    }
  }, [stats.queued, isProcessing, updateStats, showFeedback])

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

  const handleClearSentHistory = useCallback(() => {
    handleDeleteAction(
      () => NativeLocationService.clearSentHistory().then(() => stats.sent),
      (count) => `Cleared ${count} sent location${count !== 1 ? "s" : ""}`
    )
  }, [handleDeleteAction, stats.sent])

  const handleClearQueue = useCallback(() => {
    handleDeleteAction(
      () => NativeLocationService.clearQueue(),
      (count) => `Cleared ${count} queued location${count !== 1 ? "s" : ""}`
    )
  }, [handleDeleteAction])

  const handleDeleteOlderThan = useCallback(() => {
    const days = parseInt(daysInput, 10)
    if (isNaN(days) || days <= 0) {
      showFeedback("Please enter a valid number of days")
      return
    }

    handleDeleteAction(
      () => NativeLocationService.deleteOlderThan(days),
      (count) => `Deleted ${count} old location${count !== 1 ? "s" : ""}`
    )
  }, [daysInput, handleDeleteAction, showFeedback])

  const handleVacuum = useCallback(async () => {
    setIsProcessing(true)
    try {
      await NativeLocationService.vacuumDatabase()
      await updateStats()
      showFeedback("Database optimized")
    } catch (err) {
      logger.error("[DataManagementScreen] Vacuum failed:", err)
      showFeedback("Optimization failed")
    } finally {
      setIsProcessing(false)
    }
  }, [updateStats, showFeedback])

  return (
    <Container>
      <KeyboardAvoidingView style={styles.keyboardAvoid} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Data Management</Text>
          </View>

          {/* Stats */}
          <View style={styles.section}>
            <SectionTitle>DATABASE STATISTICS</SectionTitle>
            <Card>
              {[
                ["Total Locations", stats.total.toLocaleString(), colors.text],
                ["Sent", stats.sent.toLocaleString(), colors.success],
                ["Queued", stats.queued.toLocaleString(), colors.warning],
                ["Today", stats.today.toLocaleString(), colors.info],
                ["Storage", `${stats.databaseSizeMB.toFixed(2)} MB`, colors.primary]
              ].map(([label, value, color], i, arr) => (
                <React.Fragment key={i}>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
                    <Text style={[styles.statValue, { color }]}>{value}</Text>
                  </View>
                  {i < arr.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </Card>
          </View>

          {/* Queue Actions */}
          <View style={styles.section}>
            <SectionTitle>QUEUE ACTIONS</SectionTitle>
            <Card>
              <Button onPress={handleManualFlush} disabled={isProcessing || stats.queued === 0} title="Sync Now" />
              <Text style={[styles.hint, { color: colors.textLight }]}>
                {stats.queued === 0
                  ? "Queue is empty"
                  : `Trigger immediate sync of ${stats.queued} queued location${stats.queued !== 1 ? "s" : ""}`}
              </Text>
            </Card>
          </View>

          {/* Cleanup Actions */}
          <View style={styles.section}>
            <SectionTitle>CLEANUP ACTIONS</SectionTitle>
            <Card>
              {/* Clear Sent History */}
              <ActionRow
                label="Clear Sent History"
                hint="Delete all successfully sent locations"
                color={colors.success}
                textColor={colors.textLight}
                value={stats.sent.toLocaleString()}
                onPress={handleClearSentHistory}
                disabled={isProcessing || stats.sent === 0}
              />
              <Divider />

              {/* Clear Queue */}
              <ActionRow
                label="Clear Queue"
                hint="Delete all pending locations"
                color={colors.warning}
                textColor={colors.textLight}
                value={stats.queued.toLocaleString()}
                onPress={handleClearQueue}
                disabled={isProcessing || stats.queued === 0}
              />
              <Divider />

              {/* Delete Older Than */}
              <View style={styles.actionColumn}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Delete Old Locations</Text>
                <Text style={[styles.actionHint, { color: colors.textLight }]}>
                  Remove locations older than specified days
                </Text>
                <View style={styles.daysInputRow}>
                  <TextInput
                    style={[
                      styles.daysInput,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.backgroundElevated
                      }
                    ]}
                    keyboardType="numeric"
                    value={daysInput}
                    onChangeText={setDaysInput}
                    placeholder="90"
                    placeholderTextColor={colors.placeholder}
                  />
                  <Text style={[styles.daysLabel, { color: colors.textSecondary }]}>days</Text>
                  <Button
                    style={[isProcessing && styles.buttonDisabled]}
                    onPress={handleDeleteOlderThan}
                    disabled={isProcessing}
                    title="Delete"
                  />
                </View>
              </View>
              <Divider />

              {/* Vacuum */}
              <TouchableOpacity
                style={styles.actionColumn}
                onPress={handleVacuum}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionLabel, { color: colors.text }]}>Optimize Database</Text>
                <Text style={[styles.actionHint, { color: colors.textLight }]}>
                  Reclaim unused space and improve performance
                </Text>
                <View style={styles.hintRow}>
                  <Lightbulb size={12} color={colors.textLight} />
                  <Text style={[styles.actionHint, { color: colors.textLight }]}>
                    Run after large deletions to reclaim space
                  </Text>
                </View>
              </TouchableOpacity>
            </Card>
          </View>
        </ScrollView>

        {/* Floating Feedback */}
        <FloatingSaveIndicator saving={isProcessing} success={false} message={feedback} colors={colors} />
      </KeyboardAvoidingView>
    </Container>
  )
}

// --- Reusable ActionRow Component ---
const ActionRow = ({
  label,
  hint,
  color,
  textColor,
  value,
  onPress,
  disabled
}: {
  label: string
  hint: string
  color: string
  textColor: string
  value: string
  onPress: () => void
  disabled: boolean
}) => (
  <TouchableOpacity style={styles.actionRow} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
    <View style={styles.actionInfo}>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      <Text style={[styles.actionHint, { color: textColor }]}>{hint}</Text>
    </View>
    <View style={[styles.actionBadge, { backgroundColor: color + "20", borderColor: color }]}>
      <Text style={[styles.actionBadgeText, { color }]}>{value}</Text>
    </View>
  </TouchableOpacity>
)

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40
  },
  header: {
    marginTop: 20,
    marginBottom: 24
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    marginBottom: 4
  },
  section: {
    marginBottom: 24
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8
  },
  statLabel: {
    fontSize: 14,
    ...fonts.medium
  },
  statValue: {
    fontSize: 16,
    ...fonts.bold
  },
  hint: {
    fontSize: 12,
    ...fonts.regular,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 16,
    marginTop: 8
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12
  },
  actionColumn: {
    paddingVertical: 12
  },
  actionInfo: {
    flex: 1
  },
  actionLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 4
  },
  actionHint: {
    fontSize: 12,
    ...fonts.regular,
    lineHeight: 16,
    marginTop: 2
  },
  actionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1
  },
  actionBadgeText: {
    fontSize: 13,
    ...fonts.bold
  },
  daysInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8
  },
  daysInput: {
    flex: 1,
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    fontSize: 15,
    textAlign: "center"
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2
  },
  daysLabel: {
    fontSize: 15,
    ...fonts.medium
  },
  buttonDisabled: {
    opacity: 0.5
  }
})
