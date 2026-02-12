/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import { ThemeColors } from "../../../types/global"
import { getQueueColor } from "../../../helpers/queueStatus"

interface StatsCardProps {
  queueCount: number
  sentCount: number
  interval: string
  isOfflineMode: boolean
  onManageClick?: () => void
  colors: ThemeColors
}

type WarningLevel = "normal" | "warning" | "critical"

const HIGH_QUEUE_THRESHOLD = 50
const CRITICAL_QUEUE_THRESHOLD = 100

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
        <TouchableOpacity
          style={[
            styles.warningBanner,
            {
              backgroundColor: warningLevel === "critical" ? colors.error + "15" : colors.warning + "15",
              borderTopColor: colors.border
            }
          ]}
          onPress={onManageClick}
          activeOpacity={0.7}
        >
          <View style={styles.warningContent}>
            <Text
              style={[
                styles.warningIcon,
                {
                  color: warningLevel === "critical" ? colors.error : colors.warning
                }
              ]}
            >
              {warningLevel === "critical" ? "⚠️" : "⚠️"}
            </Text>
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
          <Text
            style={[
              styles.arrow,
              {
                color: warningLevel === "critical" ? colors.error : colors.warning
              }
            ]}
          >
            ›
          </Text>
        </TouchableOpacity>
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
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8
  },
  statValue: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5
  },
  unit: {
    fontSize: 16,
    fontWeight: "500"
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
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1
  },
  warningContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12
  },
  warningText: {
    flex: 1
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2
  },
  warningHint: {
    fontSize: 12
  },
  arrow: {
    fontSize: 24,
    fontWeight: "300",
    marginLeft: 8
  }
})
