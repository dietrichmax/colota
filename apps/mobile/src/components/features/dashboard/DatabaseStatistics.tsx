/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { Text, StyleSheet, View } from "react-native"
import { Figure, queueTone } from "../../ui/Figure"
import { useTheme } from "../../../hooks/useTheme"
import { useTracking } from "../../../contexts/TrackingProvider"
import { useTranslation } from "../../../i18n/useTranslation"
import { text } from "../../../styles/typography"
import { space } from "../../../constants"
import { DatabaseStats } from "../../../types/global"

type DatabaseStatisticsProps = {
  stats: DatabaseStats
}

/**
 * One hero figure and a caption, never a grid: the queue is the only number worth a glance,
 * and it is the only figure in the app allowed to leave ink once it is deep enough to act on.
 */
export const DatabaseStatistics = React.memo(function DatabaseStatistics({ stats }: DatabaseStatisticsProps) {
  const { settings } = useTracking()
  const isOfflineMode = settings.isOfflineMode
  const { colors } = useTheme()
  const { t } = useTranslation()

  const size = stats.databaseSizeMB.toFixed(1)
  const today = stats.today.toLocaleString()

  return (
    <View style={styles.block}>
      {isOfflineMode ? (
        <Figure testID="stat-total" value={stats.total.toLocaleString()} label={t("dashboard.locations")} />
      ) : (
        <Figure
          testID="stat-queued"
          value={stats.queued.toLocaleString()}
          label={t("dashboard.queued")}
          tone={queueTone(stats.queued)}
        />
      )}
      <Text style={[styles.caption, { color: colors.textSecondary }]}>
        {isOfflineMode
          ? t("dashboard.stats.subOffline", { today, size })
          : t("dashboard.stats.sub", { sent: stats.sent.toLocaleString(), today, size })}
      </Text>
    </View>
  )
})

const styles = StyleSheet.create({
  block: {
    gap: space.xs
  },
  caption: {
    ...text.caption
  }
})
