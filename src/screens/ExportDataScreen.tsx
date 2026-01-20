/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Text,
  StyleSheet,
  View,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { Container, Card, SectionTitle, Divider } from "../components";
import { useTheme } from "../hooks/useTheme";
import { ThemeColors } from "../types/global";
import NativeLocationService from "../services/NativeLocationService";
import RNFS from "react-native-fs";
import Share from "react-native-share"; // Use react-native-share instead

interface LocationData {
  id: number;
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number;
  speed: number;
  battery: number;
}

type ExportFormat = "csv" | "geojson" | "gpx" | "kml";

interface ExportStats {
  totalLocations: number;
  dateRange: { start: string; end: string } | null;
  estimatedSize: string;
}

export function ExportDataScreen() {
  const { colors } = useTheme();
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>("");
  const [stats, setStats] = useState<ExportStats>({
    totalLocations: 0,
    dateRange: null,
    estimatedSize: "0 KB",
  });
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(
    null
  );

  const formatSizes = React.useMemo(
    () => ({
      csv: 120,
      geojson: 250,
      gpx: 350,
      kml: 400,
    }),
    []
  );

  const updateSizeEstimate = useCallback(() => {
    const formatBytes = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const getEstimatedSize = () => {
      if (selectedFormat) {
        const bytes = stats.totalLocations * formatSizes[selectedFormat];
        return formatBytes(bytes);
      }
      // Show range when no format selected
      const minBytes = stats.totalLocations * formatSizes.csv;
      const maxBytes = stats.totalLocations * formatSizes.gpx;
      return `${formatBytes(minBytes)} - ${formatBytes(maxBytes)}`;
    };

    setStats((prev) => ({
      ...prev,
      estimatedSize: getEstimatedSize(),
    }));
  }, [selectedFormat, stats.totalLocations, formatSizes]);

  const loadStats = useCallback(async () => {
    try {
      const data = await NativeLocationService.getExportData();

      if (data && data.length > 0) {
        const timestamps = data.map((d) => d.timestamp).filter(Boolean);
        const start = new Date(Math.min(...timestamps));
        const end = new Date(Math.max(...timestamps));

        // Initial size estimate (range)
        const formatBytes = (bytes: number): string => {
          if (bytes < 1024) return `${bytes} B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
          return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
        };

        const sizesArray = Object.values(formatSizes);
        const minSize = Math.min(...sizesArray);
        const maxSize = Math.max(...sizesArray);

        const minBytes = data.length * minSize; // CSV
        const maxBytes = data.length * maxSize; // GPX
        const estimatedSize = `${formatBytes(minBytes)} - ${formatBytes(
          maxBytes
        )}`;

        setStats({
          totalLocations: data.length,
          dateRange: {
            start: start.toLocaleDateString(),
            end: end.toLocaleDateString(),
          },
          estimatedSize,
        });
      }
    } catch (error) {
      console.error("[ExportDataScreen] Failed to load stats:", error);
    }
  }, [formatSizes]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Update size estimate when format changes
  useEffect(() => {
    if (stats.totalLocations > 0) {
      updateSizeEstimate();
    }
  }, [stats.totalLocations, updateSizeEstimate]);

  const handleExport = async (format: ExportFormat) => {
    if (stats.totalLocations === 0) {
      Alert.alert(
        "No Data",
        "There are no locations in the database to export."
      );
      return;
    }

    setExporting(true);
    setExportProgress("Fetching location data...");

    try {
      const data: LocationData[] = await NativeLocationService.getExportData();

      setExportProgress(`Converting ${data.length} locations...`);

      let content = "";
      let fileExtension = "";
      let mimeType = "";

      switch (format) {
        case "csv":
          content = convertToCSV(data);
          fileExtension = ".csv";
          mimeType = "text/csv";
          break;
        case "geojson":
          content = convertToGeoJSON(data);
          fileExtension = ".geojson";
          mimeType = "application/json";
          break;
        case "gpx":
          content = convertToGPX(data);
          fileExtension = ".gpx";
          mimeType = "application/gpx+xml";
          break;
        case "kml":
          content = convertToKML(data);
          fileExtension = ".kml";
          mimeType = "application/vnd.google-earth.kml+xml";
          break;
      }

      const fileName = `colota_export_${Date.now()}${fileExtension}`;

      setExportProgress("Saving file...");

      const filePath = `${RNFS.CachesDirectoryPath}/${fileName}`;
      await RNFS.writeFile(filePath, content, "utf8");

      // File is ready, close loading overlay
      setExporting(false);
      setExportProgress("");

      // Wait for overlay to close before showing share dialog
      await new Promise<void>((resolve) => setTimeout(resolve, 300));

      // Now show share dialog using react-native-share
      const shareOptions = {
        title: "Export Location Data",
        message: `Colota location export: ${stats.totalLocations} locations`,
        url: Platform.OS === "android" ? `file://${filePath}` : filePath,
        type: mimeType,
        filename: fileName,
        subject: fileName, // For email
      };

      try {
        await Share.open(shareOptions);
      } catch (shareError: any) {
        // User cancelled or share failed
        if (
          shareError?.message &&
          !shareError.message.includes("User did not share")
        ) {
          console.warn("[ExportDataScreen] Share error:", shareError);
        }
      }

      // Clean up temp file after sharing
      setTimeout(async () => {
        try {
          await RNFS.unlink(filePath);
        } catch (err) {
          console.warn("[ExportDataScreen] Failed to cleanup temp file:", err);
        }
      }, 1000);
    } catch (error) {
      console.error("[ExportDataScreen] Export failed:", error);
      Alert.alert(
        "Export Failed",
        "Unable to export your data. Please try again."
      );
    } finally {
      // Clean up state
      setExporting(false);
      setExportProgress("");
      setSelectedFormat(null);
    }
  };

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            Export Data
          </Text>
        </View>

        {/* Stats Card - Matching Stats Card Style */}
        <View
          style={[
            styles.statsContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.statsGrid}>
            {/* Total Locations */}
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Total
              </Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {stats.totalLocations.toLocaleString()}
              </Text>
            </View>

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            {/* File Size */}
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Est. Size
              </Text>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {stats.estimatedSize}
              </Text>
            </View>
          </View>
        </View>

        {/* Format Selection */}
        <View style={styles.section}>
          <SectionTitle>Select Format</SectionTitle>

          <Card>
            {/* CSV Option */}
            <FormatOption
              icon="📊"
              title="CSV"
              subtitle="Spreadsheet Format"
              description="Excel, Google Sheets, data analysis"
              extension=".csv"
              selected={selectedFormat === "csv"}
              onPress={() => setSelectedFormat("csv")}
              colors={colors}
            />

            <Divider />

            {/* GeoJSON Option */}
            <FormatOption
              icon="🗺️"
              title="GeoJSON"
              subtitle="Geographic Data"
              description="Mapbox, Leaflet, QGIS, ArcGIS"
              extension=".geojson"
              selected={selectedFormat === "geojson"}
              onPress={() => setSelectedFormat("geojson")}
              colors={colors}
            />

            <Divider />

            {/* GPX Option */}
            <FormatOption
              icon="📍"
              title="GPX"
              subtitle="GPS Exchange"
              description="Garmin, Strava, Google Earth"
              extension=".gpx"
              selected={selectedFormat === "gpx"}
              onPress={() => setSelectedFormat("gpx")}
              colors={colors}
            />

            <Divider />

            {/* KML Option */}
            <FormatOption
              icon="🌍"
              title="KML"
              subtitle="Keyhole Markup Language"
              description="Google Earth, Google Maps, ArcGIS"
              extension=".kml"
              selected={selectedFormat === "kml"}
              onPress={() => setSelectedFormat("kml")}
              colors={colors}
            />
          </Card>
        </View>

        {/* Export Button */}
        {selectedFormat && (
          <View style={styles.exportSection}>
            <TouchableOpacity
              style={[
                styles.exportButton,
                {
                  backgroundColor: colors.primary,
                },
                exporting && styles.disabledButton,
              ]}
              onPress={() => handleExport(selectedFormat)}
              disabled={exporting || stats.totalLocations === 0}
              activeOpacity={0.7}
            >
              <View style={styles.exportContent}>
                <Text style={styles.exportIcon}>📤</Text>
                <View style={styles.exportText}>
                  <Text style={styles.exportTitle}>
                    Export {selectedFormat.toUpperCase()}
                  </Text>
                  <Text style={styles.exportSubtitle}>
                    {stats.totalLocations.toLocaleString()} locations •{" "}
                    {stats.estimatedSize}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Loading Overlay */}
      {exporting && (
        <View style={[styles.loader, { backgroundColor: colors.overlay }]}>
          <View style={[styles.loaderCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loaderTitle, { color: colors.text }]}>
              Exporting Data
            </Text>
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>
              {exportProgress}
            </Text>
          </View>
        </View>
      )}
    </Container>
  );
}

// --- Format Option Component (Matching PresetOption style) ---

const FormatOption = ({
  icon,
  title,
  subtitle,
  description,
  extension,
  selected,
  onPress,
  colors,
}: {
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  extension: string;
  selected: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) => {
  const backgroundColor = selected ? colors.primary + "12" : "transparent";
  const radioBgColor = selected ? colors.primary + "20" : "transparent";

  return (
    <TouchableOpacity
      style={[styles.formatOption, { backgroundColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Selection indicator bar */}
      {selected && (
        <View
          style={[styles.selectionBar, { backgroundColor: colors.primary }]}
        />
      )}

      <View style={styles.formatContent}>
        {/* Left side - Icon and text */}
        <View style={styles.leftContent}>
          <Text style={styles.formatIcon}>{icon}</Text>
          <View style={styles.textContent}>
            <View style={styles.titleRow}>
              <Text style={[styles.formatTitle, { color: colors.text }]}>
                {title}
              </Text>
              <View
                style={[
                  styles.extensionBadge,
                  {
                    backgroundColor: selected
                      ? colors.primary + "20"
                      : colors.primary + "15",
                    borderColor: selected
                      ? colors.primary + "60"
                      : colors.primary + "30",
                  },
                ]}
              >
                <Text style={[styles.extensionText, { color: colors.primary }]}>
                  {extension}
                </Text>
              </View>
            </View>
            <Text
              style={[styles.formatSubtitle, { color: colors.textSecondary }]}
            >
              {subtitle}
            </Text>
            <Text
              style={[styles.formatDescription, { color: colors.textLight }]}
            >
              {description}
            </Text>
          </View>
        </View>

        {/* Right side - Radio button */}
        <View
          style={[
            styles.radio,
            {
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: radioBgColor,
            },
          ]}
        >
          {selected && (
            <View
              style={[styles.radioInner, { backgroundColor: colors.primary }]}
            />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// --- Format Conversion Functions ---

const convertToCSV = (data: LocationData[]): string => {
  const headers =
    "id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery\n";
  const rows = data
    .map((item) => {
      const isoTime = new Date(item.timestamp).toISOString();
      return [
        item.id,
        item.timestamp,
        isoTime,
        item.latitude,
        item.longitude,
        item.accuracy,
        item.altitude ?? 0,
        item.speed ?? 0,
        item.battery ?? 0,
      ].join(",");
    })
    .join("\n");
  return headers + rows;
};

const convertToGeoJSON = (data: LocationData[]): string => {
  const features = data.map((item) => {
    const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();
    const timeStr = isNaN(timestamp.getTime())
      ? new Date().toISOString()
      : timestamp.toISOString();

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [item.longitude || 0, item.latitude || 0],
      },
      properties: {
        id: item.id,
        accuracy: item.accuracy,
        altitude: item.altitude,
        speed: item.speed,
        battery: item.battery,
        time: timeStr,
      },
    };
  });

  return JSON.stringify(
    {
      type: "FeatureCollection",
      features,
    },
    null,
    2
  );
};

const convertToGPX = (data: LocationData[]): string => {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Colota" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <n>Colota Location Export</n>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <n>Colota Track Export</n>
    <trkseg>`;

  data.forEach((item) => {
    const time = new Date(item.timestamp).toISOString();
    gpx += `
      <trkpt lat="${item.latitude.toFixed(6)}" lon="${item.longitude.toFixed(
      6
    )}">
        <ele>${item.altitude || 0}</ele>
        <time>${time}</time>
        <extensions>
          <accuracy>${item.accuracy || 0}</accuracy>
          <speed>${item.speed || 0}</speed>
          <battery>${item.battery || 0}</battery>
        </extensions>
      </trkpt>`;
  });

  gpx += `
    </trkseg>
  </trk>
</gpx>`;
  return gpx;
};

const convertToKML = (data: LocationData[]): string => {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Colota Location Export</name>
    <description>Exported tracks from Colota Tracking</description>
    <Style id="pathStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Track Path</name>
      <styleUrl>#pathStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${data
            .map(
              (item) =>
                `${item.longitude},${item.latitude},${item.altitude || 0}`
            )
            .join("\n          ")}
        </coordinates>
      </LineString>
    </Placemark>`;

  // Add individual points as Placemarks
  data.forEach((item) => {
    const time = new Date(item.timestamp).toISOString();
    kml += `
    <Placemark>
      <TimeStamp><when>${time}</when></TimeStamp>
      <description>Accuracy: ${item.accuracy}m, Speed: ${
      item.speed
    }m/s</description>
      <Point>
        <coordinates>${item.longitude},${item.latitude},${
      item.altitude || 0
    }</coordinates>
      </Point>
    </Placemark>`;
  });

  kml += `
  </Document>
</kml>`;
  return kml;
};

// --- Styles ---
const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },

  // Header
  header: {
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },

  // Stats Container - Matching StatsCard style
  statsContainer: {
    borderRadius: 16,
    borderWidth: 2,
    marginHorizontal: 20,
    marginBottom: 24,
    overflow: "hidden",
  },
  statsGrid: {
    flexDirection: "row",
    padding: 20,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  divider: {
    width: 1,
    marginHorizontal: 12,
    opacity: 0.3,
  },

  // Section
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },

  // Format Option - Matching PresetOption style
  formatOption: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    position: "relative",
  },
  selectionBar: {
    position: "absolute",
    left: -20,
    top: 0,
    bottom: 0,
    width: 4,
  },
  formatContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  leftContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  formatIcon: {
    fontSize: 28,
  },
  textContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  formatTitle: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  extensionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  extensionText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  formatSubtitle: {
    fontSize: 13,
    marginBottom: 2,
  },
  formatDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  // Export Button
  exportSection: {
    paddingHorizontal: 20,
  },
  exportButton: {
    borderRadius: 14,
    padding: 18,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  exportContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  exportIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  exportText: {
    flex: 1,
  },
  exportTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  exportSubtitle: {
    fontSize: 13,
    color: "#fff",
    opacity: 0.9,
  },

  // Disabled State
  disabledButton: {
    opacity: 0.5,
  },

  // Loader
  loader: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  loaderCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 240,
  },
  loaderTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  loaderText: {
    fontSize: 13,
    textAlign: "center",
  },
});
