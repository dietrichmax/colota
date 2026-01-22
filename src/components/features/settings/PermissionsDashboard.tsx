/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import {
  checkPermissions,
  PermissionStatus,
  ensurePermissions,
} from "../../../services/LocationServicePermission";
import { useTheme } from "../../../hooks/useTheme";
import { Container, Button } from "../..";

type RowProps = {
  label: string;
  isGranted: boolean;
  colors: any;
};

const PermissionRow = ({ label, isGranted, colors }: RowProps) => (
  <View style={[styles.row, { borderBottomColor: colors.border }]}>
    <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
    <Text
      style={[
        styles.status,
        { color: isGranted ? colors.success : colors.error },
      ]}
    >
      {isGranted ? "✅ Active" : "❌ Missing"}
    </Text>
  </View>
);

export const PermissionDashboard = () => {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const { colors } = useTheme();

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    const currentStatus = await checkPermissions();
    setStatus(currentStatus);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleFix = async () => {
    const success = await ensurePermissions();
    if (success) refreshStatus();
  };

  if (loading && !status) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Container>
      <Text style={[styles.title, { color: colors.text }]}>
        Tracking-Status
      </Text>

      <PermissionRow
        label="Standort (Präzise)"
        isGranted={status?.location ?? false}
        colors={colors}
      />
      <PermissionRow
        label="Hintergrund-Zugriff"
        isGranted={status?.background ?? false}
        colors={colors}
      />
      <PermissionRow
        label="Benachrichtigungen"
        isGranted={status?.notifications ?? false}
        colors={colors}
      />
      <PermissionRow
        label="Akku-Optimierung aus"
        isGranted={status?.batteryOptimized ?? false}
        colors={colors}
      />

      {(!status?.location ||
        !status?.background ||
        !status?.notifications ||
        !status?.batteryOptimized) && (
        <View style={styles.buttonContainer}>
          <Button onPress={handleFix} title="Request missing permissions" />
        </View>
      )}
    </Container>
  );
};

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 14 },
  status: { fontSize: 14, fontWeight: "600" },
  buttonContainer: {
    marginTop: 24,
  },
});
