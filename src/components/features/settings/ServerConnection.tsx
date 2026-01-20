/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useRef } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../../hooks/useTheme";
import { useTracking } from "../../../contexts/TrackingProvider";
import { ServerStatus, ServerConnectionProps } from "../../../types/global";

const SERVER_TIMEOUT = 5000;
const SERVER_CHECK_INTERVAL = 5 * 60 * 1000;

export function ServerConnection({
  endpoint,
  navigation,
}: ServerConnectionProps) {
  const { colors } = useTheme();
  const { settings } = useTracking();
  const isOffline = settings.isOfflineMode;

  const [serverStatus, setServerStatus] = useState<
    ServerStatus | "offline" | null
  >(null);

  // Track if we've done the initial check
  const hasChecked = useRef(false);

  /** Checks server connection status */
  const checkServer = useCallback(async () => {
    if (isOffline) {
      setServerStatus("offline");
      hasChecked.current = true;
      return;
    }

    if (!endpoint) {
      setServerStatus("notConfigured");
      hasChecked.current = true;
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SERVER_TIMEOUT);

    try {
      // Strategy 1: Try dedicated health endpoint
      const healthUrl = endpoint.replace(/\/api\/locations$/, "/health");

      let response = await fetch(healthUrl, {
        method: "HEAD",
        signal: controller.signal,
      });

      // Strategy 2: If health endpoint doesn't exist, try HEAD on main endpoint
      if (response.status === 404 || response.status === 405) {
        response = await fetch(endpoint, {
          method: "HEAD",
          signal: controller.signal,
        });
      }

      // Strategy 3: If endpoint still fails, try root domain
      if (!response.ok) {
        const match = endpoint.match(/^(https?:\/\/[^\/]+)/);
        if (match) {
          const rootUrl = match[1];
          response = await fetch(rootUrl, {
            method: "GET",
            signal: controller.signal,
          });
        }
      }

      setServerStatus(response.ok ? "connected" : "error");
      hasChecked.current = true;
    } catch (err: any) {
      setServerStatus("error");
      hasChecked.current = true;
    } finally {
      clearTimeout(timeoutId);
    }
  }, [endpoint, isOffline]);

  // Re-run check when focus returns or offline mode toggles
  useFocusEffect(
    useCallback(() => {
      // Only reset if settings changed
      if (!hasChecked.current) {
        checkServer();
      } else {
        // Silently recheck in background without resetting state
        checkServer();
      }

      const timer = setInterval(checkServer, SERVER_CHECK_INTERVAL);
      return () => clearInterval(timer);
    }, [checkServer])
  );

  const displayUrl = endpoint
    ? endpoint.replace(/^https?:\/\//, "").split("/")[0]
    : "";

  /** Dynamic UI configuration based on status */
  const config = useMemo(() => {
    const statusMap = {
      connected: {
        color: colors.success,
        label: "Connected",
        description: `Location data is being sent to ${displayUrl}.`,
      },
      error: {
        color: colors.error,
        label: "Error",
        description: "Cannot reach the server. Check your endpoint or network.",
      },
      notConfigured: {
        color: colors.warning,
        label: "Not configured",
        description: "Configure an endpoint in settings to start syncing data.",
      },
      offline: {
        color: colors.textSecondary, // Neutralere Farbe für Offline
        label: "Offline Mode",
        description: "Syncing is paused. Data is only collected locally.",
      },
      loading: {
        color: colors.textLight,
        label: "Checking...",
        description: "Verifying connection to the server...",
      },
    };

    // Show loading state until first check completes
    if (serverStatus === null) {
      return statusMap.loading;
    }

    return isOffline
      ? statusMap.offline
      : statusMap[serverStatus as ServerStatus] || statusMap.error;
  }, [serverStatus, colors, isOffline, displayUrl]);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigation.navigate("Settings")}
      style={[
        styles.serverCard,
        {
          backgroundColor: colors.card,
          borderLeftColor: config.color,
          borderColor: colors.border,
          borderWidth: 1, // Optional für bessere Sichtbarkeit
        },
      ]}
    >
      <View style={styles.serverHeader}>
        <Text style={[styles.serverLabel, { color: colors.text }]}>
          SERVER CONNECTION
        </Text>
        <View
          style={[
            styles.serverIndicator,
            {
              backgroundColor: config.color + "20",
              borderColor: config.color,
            },
          ]}
        >
          <Text style={[styles.serverIndicatorText, { color: config.color }]}>
            {config.label}
          </Text>
        </View>
      </View>
      <Text style={[styles.serverDescription, { color: colors.textLight }]}>
        {config.description}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  serverCard: {
    borderLeftWidth: 3,
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
  },
  serverHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  serverLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  serverIndicator: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  serverIndicatorText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3 },
  serverDescription: { fontSize: 13, lineHeight: 18 },
});
