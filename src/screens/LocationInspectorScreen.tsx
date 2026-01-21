/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from "react-native";
import { Container, Card } from "../components";
import { useTheme } from "../hooks/useTheme";
import { ThemeColors } from "../types/global";
import NativeLocationService from "../services/NativeLocationService";

// Types
interface LocationData {
  id?: number;
  location_id?: number;
  timestamp?: number;
  created_at?: number;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  accuracy?: number;
  bearing?: number;
  battery: number;
  battery_status: number;
  last_error?: string;
}

interface LocationItemProps {
  item: LocationData;
  colors: ThemeColors;
  isQueue: boolean;
}

interface MetricProps {
  label: string;
  value: string;
  colors: ThemeColors;
}

interface TabProps {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
}

type TableType = "locations" | "queue";

/**
 * Memoized row component to prevent re-renders during scrolling
 */
const LocationItem = memo(({ item, colors, isQueue }: LocationItemProps) => {
  const getBatteryStatus = (status: number): string => {
    console.log("batterystatus" + status)
    switch (status) {
      case 0:
        return "Unknown";
      case 1:
        return "Unplugged";
      case 2:
        return "Charging";
      case 3:
        return "Full";
      default:
        return "Unknown";
    }
  };

  const timestamp = item.timestamp || item.created_at || Date.now();

  return (
    <Card style={styles.itemCard}>
      <View style={styles.row}>
        <Text style={[styles.id, { color: colors.primary }]}>
          #{item.id || item.location_id}
        </Text>
        <Text style={[styles.time, { color: colors.textSecondary }]}>
          {new Date(timestamp).toLocaleTimeString()}
        </Text>
      </View>

      <Text style={[styles.coords, { color: colors.text }]}>
        {item.latitude?.toFixed(6)}°, {item.longitude?.toFixed(6)}°
      </Text>

      <View style={[styles.metricsGrid, { borderTopColor: colors.border }]}>
        <Metric
          label="Altitude"
          value={`${item.altitude?.toFixed(1) ?? 0}m`}
          colors={colors}
        />
        <Metric
          label="Speed"
          value={`${item.speed?.toFixed(1) ?? 0}m/s`}
          colors={colors}
        />
        <Metric
          label="Accuracy"
          value={`±${item.accuracy?.toFixed(1) ?? 0}m`}
          colors={colors}
        />
        <Metric
          label="Bearing"
          value={`${item.bearing?.toFixed(0) ?? 0}°`}
          colors={colors}
        />
      </View>

      <View
        style={[
          styles.metricsGrid,
          styles.batteryGrid,
          { borderTopColor: colors.border },
        ]}
      >
        <Metric label="Battery" value={`${item.battery}%`} colors={colors} />
        <Metric
          label="Battery Status"
          value={getBatteryStatus(item.battery_status)}
          colors={colors}
        />
        <View style={styles.spacer} />
        <View style={styles.spacer} />
      </View>

      {isQueue && item.last_error && (
        <Text style={[styles.errorText, { color: colors.error }]}>
          ⚠ {item.last_error}
        </Text>
      )}
    </Card>
  );
});

LocationItem.displayName = "LocationItem";

export function LocationInspectorScreen() {
  const { colors } = useTheme();
  const [activeTable, setActiveTable] = useState<TableType>("locations");
  const [data, setData] = useState<LocationData[]>([]);
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fetches data based on current pagination and table selection */
  const fetchData = useCallback(async () => {
    try {
      const offset = page * limit;
      const result = await NativeLocationService.getTableData(
        activeTable,
        limit,
        offset
      );
      setData(result || []);
    } catch (err) {
      console.error("[LocationInspector] Fetch error:", err);
      setData([]);
    }
  }, [activeTable, limit, page]);

  /** Fetch data when dependencies change */
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** Auto-refresh logic */
  useEffect(() => {
    if (autoRefresh) {
      setPage(0); // Always show newest data in live mode
      refreshInterval.current = setInterval(fetchData, 3000);
    } else {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    }
    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [autoRefresh, fetchData]);

  const handleTableChange = (table: TableType) => {
    setActiveTable(table);
    setPage(0);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(0);
  };

  return (
    <Container>
      {/* Header with Live Mode Toggle */}
      <View style={styles.headerRow}>
        <Text
          style={[
            styles.statusText,
            { color: autoRefresh ? colors.primary : colors.textSecondary },
          ]}
        >
          {autoRefresh ? "● Live Mode" : "Manual Mode"}
        </Text>

        <View style={styles.controls}>
          <View style={styles.toggleContainer}>
            <Text
              style={[styles.controlLabel, { color: colors.textSecondary }]}
            >
              LIVE
            </Text>
            <Switch
              value={autoRefresh}
              onValueChange={setAutoRefresh}
              thumbColor={autoRefresh ? colors.primary : "#f4f3f4"}
            />
          </View>

          <TouchableOpacity
            onPress={fetchData}
            disabled={autoRefresh}
            style={[
              styles.refreshBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
              autoRefresh && styles.refreshBtnDisabled,
            ]}
          >
            <Text style={[styles.btnText, { color: colors.primary }]}>
              Refresh
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Limit Selection and Pagination */}
      <View style={styles.limitBar}>
        <View style={styles.limitOptions}>
          {[10, 50, 100].map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => handleLimitChange(v)}
              style={[
                styles.limitBtn,
                {
                  backgroundColor: limit === v ? colors.primary : colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.limitBtnText,
                  limit === v
                    ? styles.limitBtnTextActive
                    : { color: colors.text },
                ]}
              >
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!autoRefresh && (
          <View style={styles.paginationRow}>
            <TouchableOpacity
              onPress={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={styles.pageBtn}
            >
              <Text
                style={[
                  styles.pageBtnText,
                  {
                    color: page === 0 ? colors.textDisabled : colors.primary,
                  },
                ]}
              >
                ◀
              </Text>
            </TouchableOpacity>
            <Text style={[styles.pageIndicator, { color: colors.text }]}>
              {page + 1}
            </Text>
            <TouchableOpacity
              onPress={() => setPage((p) => p + 1)}
              disabled={data.length < limit}
              style={styles.pageBtn}
            >
              <Text
                style={[
                  styles.pageBtnText,
                  {
                    color:
                      data.length < limit
                        ? colors.textDisabled
                        : colors.primary,
                  },
                ]}
              >
                ▶
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <Tab
          label="History"
          active={activeTable === "locations"}
          onPress={() => handleTableChange("locations")}
          colors={colors}
        />
        <Tab
          label="Queue"
          active={activeTable === "queue"}
          onPress={() => handleTableChange("queue")}
          colors={colors}
        />
      </View>

      {/* Location List */}
      <FlatList
        data={data}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item, index) => `${activeTable}-${item.id || index}`}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textLight }]}>
            No data available
          </Text>
        }
        renderItem={({ item }) => (
          <LocationItem
            item={item}
            colors={colors}
            isQueue={activeTable === "queue"}
          />
        )}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </Container>
  );
}

// Subcomponents
const Metric = ({ label, value, colors }: MetricProps) => (
  <View style={styles.metricItem}>
    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
      {label}
    </Text>
    <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
  </View>
);

const Tab = ({ label, active, onPress, colors }: TabProps) => {
  const borderBottomColor = active ? colors.primary : "transparent";
  const textColor = active ? colors.primary : colors.textSecondary;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.tab,
        active ? styles.tabActive : styles.tabInactive,
        { borderBottomColor },
      ]}
    >
      <Text
        style={[
          styles.tabText,
          active ? styles.tabTextActive : styles.tabTextInactive,
          { color: textColor },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
  },
  controlLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginRight: 6,
  },
  refreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  refreshBtnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  limitBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  limitOptions: {
    flexDirection: "row",
  },
  limitBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
  },
  limitBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  limitBtnTextActive: {
    color: "#FFFFFF",
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pageBtn: {
    padding: 8,
  },
  pageBtnText: {
    fontWeight: "bold",
    fontSize: 16,
  },
  pageIndicator: {
    fontSize: 14,
    fontWeight: "bold",
    marginHorizontal: 8,
  },
  tabBar: {
    flexDirection: "row",
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 2,
  },
  tabActive: {
    // Additional styles for active tab if needed
  },
  tabInactive: {
    // Additional styles for inactive tab if needed
  },
  tabText: {
    fontSize: 14,
  },
  tabTextActive: {
    fontWeight: "700",
  },
  tabTextInactive: {
    fontWeight: "400",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  itemCard: {
    marginBottom: 10,
    padding: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  id: {
    fontWeight: "bold",
    fontSize: 12,
  },
  time: {
    fontSize: 11,
  },
  coords: {
    fontFamily: "monospace",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
  },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 4,
  },
  batteryGrid: {
    paddingTop: 6,
    marginTop: 2,
  },
  metricItem: {
    flex: 1,
    alignItems: "flex-start",
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 12,
    marginTop: 2,
  },
  spacer: {
    flex: 1,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
    fontStyle: "italic",
  },
  errorText: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: "italic",
  },
});
