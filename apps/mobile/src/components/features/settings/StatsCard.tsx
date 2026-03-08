/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Text, StyleSheet, Pressable } from "react-native"
import { AlertTriangle, ChevronRight } from "lucide-react-native"
import { ThemeColors } from "../../../types/global"
import { getQueueColor } from "../../../utils/queueStatus"
import { fonts } from "../../../styles/typography"
import { HIGH_QUEUE_THRESHOLD, CRITICAL_QUEUE_THRESHOLD } from "../../../constants"

interface StatsCardProps {
  queueCount: number
  sentCount: number
  interval: string
  isOfflineMode: boolean
  onManageClick?: () => void
  colors: ThemeColors
}

type WarningLevel = "normal" | "warning" | "critical"

/**
 * StatsCard Component - Improved Design
 *
 * Enhanced visual hierarchy with:
 * - Cleaner stat presentation
 * - Better color coding
 * - Improved warning states
 * - More prominent CTA when needed
 */
export function StatsCard({ queueCount, sentCount, interval, isOfflineMode, onManageClick, colors }: StatsCardProps) {
  const getWarningLevel = (): WarningLevel => {
    if (queueCount > CRITICAL_QUEUE_THRESHOLD) return "critical"
    if (queueCount > HIGH_QUEUE_THRESHOLD) return "warning"
    return "normal"
  }

  const queuedColor = getQueueColor(queueCount, colors)
  const warningLevel = getWarningLevel()
  const showWarning = queueCount > HIGH_QUEUE_THRESHOLD

  const getBorderColor = () => {
    switch (warningLevel) {
      case "critical":
        return colors.error
      case "warning":
        return colors.warning
      default:
        return colors.border
    }
  }

  const getBackgroundGradient = () => {
    switch (warningLevel) {
      case "critical":
        return colors.error + "08"
      case "warning":
        return colors.warning + "08"
      default:
        return "transparent"
    }
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: getBorderColor()
        }
      ]}
    >
      {/* Gradient overlay for warning states */}
      {warningLevel !== "normal" && (
        <View style={[styles.gradientOverlay, { backgroundColor: getBackgroundGradient() }]} />
      )}

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {/* Queued */}
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Queued</Text>
          <Text style={[styles.statValue, { color: queuedColor }]}>{queueCount.toLocaleString()}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Sent */}
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Sent</Text>
          <Text
            style={[
              styles.statValue,
              {
                color: isOfflineMode ? colors.textLight : colors.success
              }
            ]}
          >
            {isOfflineMode ? "—" : sentCount.toLocaleString()}
          </Text>
          {isOfflineMode && <Text style={[styles.disabledHint, { color: colors.textLight }]}>Offline</Text>}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Interval */}
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Interval</Text>
          <Text style={[styles.statValue, { color: colors.info }]}>
            {interval}
            <Text style={[styles.unit, { color: colors.textSecondary }]}>s</Text>
          </Text>
        </View>
      </View>

      {/* Warning Banner */}
      {showWarning && onManageClick && (
        <View style={styles.warningWrapper}>
          <Pressable
            style={({ pressed }) => {
              const accent = warningLevel === "critical" ? colors.error : colors.warning
              return [
                styles.warningButton,
                {
                  backgroundColor: accent + "15",
                  borderColor: accent + "40"
                },
                pressed && { opacity: 0.7 }
              ]
            }}
            onPress={onManageClick}
          >
            <View style={styles.warningContent}>
              <AlertTriangle size={20} color={warningLevel === "critical" ? colors.error : colors.warning} />
              <View style={styles.warningText}>
                <Text
                  style={[
                    styles.warningTitle,
                    {
                      color: warningLevel === "critical" ? colors.error : colors.warning
                    }
                  ]}
                >
                  {warningLevel === "critical" ? "Critical Queue Size" : "High Queue Size"}
                </Text>
                <Text style={[styles.warningHint, { color: colors.textSecondary }]}>Tap to manage data</Text>
              </View>
            </View>
            <ChevronRight size={20} color={warningLevel === "critical" ? colors.error : colors.warning} />
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 24,
    overflow: "hidden"
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  statsGrid: {
    flexDirection: "row",
    padding: 20
  },
  statItem: {
    flex: 1,
    alignItems: "center"
  },
  statLabel: {
    fontSize: 12,
    ...fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8
  },
  statValue: {
    fontSize: 24,
    ...fonts.bold,
    letterSpacing: -0.5
  },
  unit: {
    fontSize: 16,
    ...fonts.medium
  },
  disabledHint: {
    fontSize: 11,
    marginTop: 2,
    fontStyle: "italic"
  },
  divider: {
    width: 1,
    marginHorizontal: 12,
    opacity: 0.3
  },
  warningWrapper: {
    paddingHorizontal: 12,
    paddingBottom: 12
  },
  warningButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5
  },
  warningContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1
  },
  warningText: {
    flex: 1,
    marginLeft: 12
  },
  warningTitle: {
    fontSize: 14,
    ...fonts.semiBold,
    marginBottom: 2
  },
  warningHint: {
    fontSize: 12,
    ...fonts.regular
  }
})
