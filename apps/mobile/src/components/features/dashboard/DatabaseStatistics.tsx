/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { Text, StyleSheet, View } from "react-native"
import { SectionTitle, Card } from "../.."
import { useTheme } from "../../../hooks/useTheme"
import { useTracking } from "../../../contexts/TrackingProvider"
import { fontSizes, fonts } from "../../../styles/typography"
import { DatabaseStats } from "../../../types/global"
import { getQueueColor } from "../../../utils/queueStatus"
import { space } from "../../../constants"

type DatabaseStatisticsProps = {
  stats: DatabaseStats
}

export const DatabaseStatistics = React.memo(function DatabaseStatistics({ stats }: DatabaseStatisticsProps) {
  const { settings } = useTracking()
  const isOfflineMode = settings.isOfflineMode
  const { colors } = useTheme()
  const queuedColor = getQueueColor(stats.queued, colors)

  return (
    <>
      {/* Database Statistics */}
      <View style={styles.metricsSection}>
        <SectionTitle>Database statistics</SectionTitle>
        {!isOfflineMode ? (
          <View style={styles.statsGrid}>
            <Card variant="elevated" style={styles.statCard}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Queued</Text>
              <Text style={[styles.statValue, { color: queuedColor }]}>{stats.queued.toLocaleString()}</Text>
              <Text style={[styles.statUnit, { color: colors.textLight }]}>pending</Text>
            </Card>
            <Card variant="elevated" style={styles.statCard}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Sent</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.sent.toLocaleString()}</Text>
              <Text style={[styles.statUnit, { color: colors.textLight }]}>synced</Text>
            </Card>
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <Card variant="elevated" style={styles.statCard}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>{stats.total.toLocaleString()}</Text>
              <Text style={[styles.statUnit, { color: colors.textLight }]}>locations</Text>
            </Card>
          </View>
        )}
        <View style={[styles.statsGrid, styles.statsGridSpaced]}>
          <Card variant="elevated" style={styles.statCard}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Today</Text>
            <Text style={[styles.statValue, { color: colors.info }]}>{stats.today.toLocaleString()}</Text>
            <Text style={[styles.statUnit, { color: colors.textLight }]}>tracked</Text>
          </Card>
          <Card variant="elevated" style={styles.statCard}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Storage</Text>
            <Text style={[styles.statValue, { color: colors.primaryDark }]}>{stats.databaseSizeMB.toFixed(1)}</Text>
            <Text style={[styles.statUnit, { color: colors.textLight }]}>MB</Text>
          </Card>
        </View>
      </View>
    </>
  )
})

const styles = StyleSheet.create({
  metricsSection: {
    marginBottom: space.xl
  },
  statsGrid: {
    flexDirection: "row",
    gap: space.md
  },
  statsGridSpaced: {
    marginTop: space.md
  },
  statCard: {
    alignItems: "center"
  },
  statUnit: {
    fontSize: fontSizes.small,
    ...fonts.medium
  },
  statLabel: {
    fontSize: fontSizes.micro,
    ...fonts.semiBold,
    marginBottom: 6
  },
  statValue: {
    fontSize: fontSizes.statValue,
    ...fonts.bold,
    letterSpacing: -0.5,
    marginBottom: 2
  }
})
