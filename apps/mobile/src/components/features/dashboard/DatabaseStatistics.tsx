/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { StyleSheet, View } from "react-native"
import { TriangleAlert } from "lucide-react-native"
import { SectionTitle, Card, StatRow } from "../.."
import { useTheme } from "../../../hooks/useTheme"
import { useTracking } from "../../../contexts/TrackingProvider"
import { DatabaseStats } from "../../../types/global"
import { HIGH_QUEUE_THRESHOLD, size, space } from "../../../constants"

type DatabaseStatisticsProps = {
  stats: DatabaseStats
}

export const DatabaseStatistics = React.memo(function DatabaseStatisticsView({ stats }: DatabaseStatisticsProps) {
  const { settings } = useTracking()
  const isOfflineMode = settings.isOfflineMode
  const { colors } = useTheme()

  const queueBacklogged = stats.queued > HIGH_QUEUE_THRESHOLD

  return (
    <View style={styles.metricsSection}>
      <SectionTitle>Database statistics</SectionTitle>
      <Card rows>
        {isOfflineMode ? (
          <StatRow label="Stored" value={stats.total.toLocaleString()} />
        ) : (
          <>
            <StatRow label="Queued" value={stats.queued.toLocaleString()}>
              {queueBacklogged ? (
                <TriangleAlert accessibilityLabel="queue-backlog" size={size.icon.sm} color={colors.warning} />
              ) : null}
            </StatRow>
            <StatRow label="Sent" value={stats.sent.toLocaleString()} />
          </>
        )}
        <StatRow label="Today" value={stats.today.toLocaleString()} />
        <StatRow label="Storage" value={`${stats.databaseSizeMB.toFixed(1)} MB`} />
      </Card>
    </View>
  )
})

const styles = StyleSheet.create({
  metricsSection: {
    marginBottom: space.xl
  }
})
