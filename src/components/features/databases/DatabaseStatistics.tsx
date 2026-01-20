/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react";
import { Text, StyleSheet, View } from "react-native";
import { SectionTitle, Card } from "../..";
import { useTheme } from "../../../hooks/useTheme";
import { getQueueColor } from "../../../helpers/queueStatus";

type DatabaseStatisticsProps = {
  stats: any;
};

export function DatabaseStatistics({ stats }: DatabaseStatisticsProps) {
  const { colors } = useTheme();

  const queuedColor = getQueueColor(stats.queued, colors);

  return (
    <>
      {/* Database Statistics */}
      <View style={styles.metricsSection}>
        <SectionTitle>DATABASE STATISTICS</SectionTitle>
        <View style={styles.statsGrid}>
          <Card
            style={[
              {
                backgroundColor: colors.backgroundElevated,
                alignItems: "center",
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Queued
            </Text>
            <Text style={[styles.statValue, { color: queuedColor }]}>
              {stats.queued.toLocaleString()}
            </Text>
            <Text style={[styles.statUnit, { color: colors.textLight }]}>
              pending
            </Text>
          </Card>
          <Card
            style={[
              {
                backgroundColor: colors.backgroundElevated,
                alignItems: "center",
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Sent
            </Text>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {stats.sent.toLocaleString()}
            </Text>
            <Text style={[styles.statUnit, { color: colors.textLight }]}>
              synced
            </Text>
          </Card>
        </View>

        <View style={[styles.statsGrid, { marginTop: 12 }]}>
          <Card
            style={[
              {
                backgroundColor: colors.backgroundElevated,
                alignItems: "center",
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Today
            </Text>
            <Text style={[styles.statValue, { color: colors.info }]}>
              {stats.today.toLocaleString()}
            </Text>
            <Text style={[styles.statUnit, { color: colors.textLight }]}>
              tracked
            </Text>
          </Card>
          <Card
            style={[
              {
                backgroundColor: colors.backgroundElevated,
                alignItems: "center",
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Storage
            </Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {stats.databaseSizeMB.toFixed(1)}
            </Text>
            <Text style={[styles.statUnit, { color: colors.textLight }]}>
              MB
            </Text>
          </Card>
        </View>
      </View>
    </>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  metricsSection: { marginBottom: 24 },
  statsGrid: { flexDirection: "row", gap: 12 },
  statUnit: { fontSize: 11, fontWeight: "500" },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 2,
  },
});
