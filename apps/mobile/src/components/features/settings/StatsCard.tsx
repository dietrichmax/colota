/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Text, StyleSheet, Pressable } from "react-native"
import { TriangleAlert, ChevronRight } from "lucide-react-native"
import { useTracking } from "../../../contexts/TrackingProvider"
import { useTheme } from "../../../hooks/useTheme"
import { getQueueColor } from "../../../utils/queueStatus"
import { formatCount } from "../../../utils/format"
import { fontSizes, fonts } from "../../../styles/typography"
import { CRITICAL_QUEUE_THRESHOLD, HIGH_QUEUE_THRESHOLD, size, space } from "../../../constants"
import { radius } from "@colota/shared"

interface StatsCardProps {
  queueCount: number
  sentCount: number
  todayCount?: number
  interval: string
  onManageClick?: () => void
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
export function StatsCard({ queueCount, sentCount, todayCount, interval, onManageClick }: StatsCardProps) {
  const { settings } = useTracking()
  const { colors } = useTheme()
  const isOfflineMode = settings.isOfflineMode
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
        return colors.error + "12"
      case "warning":
        return colors.warning + "12"
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
        {isOfflineMode ? (
          <>
            {/* Today */}
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Today</Text>
              <Text numberOfLines={1} style={[styles.statValue, { color: colors.info }]}>
                {formatCount(todayCount ?? 0)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        ) : (
          <>
            {/* Queued */}
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Queued</Text>
              <Text numberOfLines={1} style={[styles.statValue, { color: queuedColor }]}>
                {formatCount(queueCount)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Sent */}
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Sent</Text>
              <Text numberOfLines={1} style={[styles.statValue, { color: colors.success }]}>
                {formatCount(sentCount)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        {/* Interval */}
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Interval</Text>
          <Text numberOfLines={1} style={[styles.statValue, { color: colors.info }]}>
            {interval}
            <Text style={[styles.unit, { color: colors.textSecondary }]}>s</Text>
          </Text>
        </View>
      </View>

      {/* Warning Banner */}
      {!isOfflineMode && showWarning && onManageClick && (
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
                pressed && { opacity: colors.pressedOpacity }
              ]
            }}
            onPress={onManageClick}
          >
            <View style={styles.warningContent}>
              <TriangleAlert size={size.icon.md} color={warningLevel === "critical" ? colors.error : colors.warning} />
              <View style={styles.warningText}>
                <Text
                  style={[
                    styles.warningTitle,
                    {
                      color: warningLevel === "critical" ? colors.error : colors.warning
                    }
                  ]}
                >
                  {warningLevel === "critical" ? "Critical queue size" : "High queue size"}
                </Text>
                <Text style={[styles.warningHint, { color: colors.textSecondary }]}>Tap to manage data</Text>
              </View>
            </View>
            <ChevronRight size={size.icon.md} color={warningLevel === "critical" ? colors.error : colors.warning} />
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 2,
    marginBottom: space.xl,
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
    fontSize: fontSizes.caption,
    ...fonts.semiBold,
    marginBottom: space.sm
  },
  statValue: {
    fontSize: fontSizes.statValue,
    ...fonts.bold,
    letterSpacing: -0.5
  },
  unit: {
    fontSize: fontSizes.label,
    ...fonts.medium
  },
  disabledHint: {
    fontSize: fontSizes.small,
    marginTop: 2,
    fontStyle: "italic"
  },
  divider: {
    width: 1,
    marginHorizontal: space.md,
    opacity: 0.3
  },
  warningWrapper: {
    paddingHorizontal: space.md,
    paddingBottom: space.md
  },
  warningButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5
  },
  warningContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1
  },
  warningText: {
    flex: 1,
    marginLeft: space.md
  },
  warningTitle: {
    fontSize: fontSizes.body,
    ...fonts.semiBold,
    marginBottom: 2
  },
  warningHint: {
    fontSize: fontSizes.caption,
    ...fonts.regular
  }
})
