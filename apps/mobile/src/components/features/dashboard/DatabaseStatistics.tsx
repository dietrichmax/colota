/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { Text, StyleSheet, View } from "react-native"
import { SectionTitle, Card } from "../.."
import { useTheme } from "../../../hooks/useTheme"
import { fonts } from "../../../styles/typography"
import { DatabaseStats } from "../../../types/global"
import { getQueueColor } from "../../../utils/queueStatus"

type DatabaseStatisticsProps = {
  stats: DatabaseStats
}

export function DatabaseStatistics({ stats }: DatabaseStatisticsProps) {
  const { colors } = useTheme()
  const queuedColor = getQueueColor(stats.queued, colors)

  return (
    <>
      {/* Database Statistics */}
      <View style={styles.metricsSection}>
        <SectionTitle>DATABASE STATISTICS</SectionTitle>
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
}

const styles = StyleSheet.create({
  metricsSection: {
    marginBottom: 24
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12
  },
  statsGridSpaced: {
    marginTop: 12
  },
  statCard: {
    alignItems: "center"
  },
  statUnit: {
    fontSize: 11,
    ...fonts.medium
  },
  statLabel: {
    fontSize: 10,
    ...fonts.semiBold,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  statValue: {
    fontSize: 24,
    ...fonts.bold,
    letterSpacing: -0.5,
    marginBottom: 2
  }
})
