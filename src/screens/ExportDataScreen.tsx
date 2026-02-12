/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  StyleSheet,
  View,
  Alert,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Container, Card, SectionTitle, Divider } from "../components";
import { useTheme } from "../hooks/useTheme";
import { ThemeColors, LocationCoords } from "../types/global";
import NativeLocationService from "../services/NativeLocationService";

type ExportFormat = "csv" | "geojson" | "gpx" | "kml";

interface ExportStats {
  totalLocations: number;
}

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MB

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getByteSize = (content: string): number => {
  return new Blob([content]).size;
};

export function ExportDataScreen() {
  const { colors } = useTheme();
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>("");
  const [stats, setStats] = useState<ExportStats>({
    totalLocations: 0,
  });
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(
    null
  );
  const [fileSize, setFileSize] = useState<string | null>(null);
  const cachedData = useRef<LocationCoords[]>([]);

  const loadStats = useCallback(async () => {
    try {
      const data = await NativeLocationService.getExportData();

      if (data && data.length > 0) {
        cachedData.current = data.map((item) => ({
          ...item,
          timestamp: item.timestamp ? item.timestamp * 1000 : Date.now(),
        }));

        setStats({ totalLocations: data.length });
      }
    } catch (error) {
      console.error("[ExportDataScreen] Failed to load stats:", error);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!selectedFormat || cachedData.current.length === 0) {
      setFileSize(null);
      return;
    }

    const converters: Record<ExportFormat, (data: LocationCoords[]) => string> =
      {
        csv: convertToCSV,
        geojson: convertToGeoJSON,
        gpx: convertToGPX,
        kml: convertToKML,
      };

    const content = converters[selectedFormat](cachedData.current);
    setFileSize(formatBytes(getByteSize(content)));
  }, [selectedFormat]);

  const handleExport = async (format: ExportFormat) => {
    if (stats.totalLocations === 0) {
      Alert.alert(
        "No Data",
        "There are no locations in the database to export."
      );
      return;
    }

    setExporting(true);
    setExportProgress("Preparing export...");

    try {
      const normalizedData = cachedData.current;

      setExportProgress(`Converting ${normalizedData.length} locations...`);

      let content = "";
      let fileExtension = "";
      let mimeType = "";

      switch (format) {
        case "csv":
          content = convertToCSV(normalizedData);
          fileExtension = ".csv";
          mimeType = "text/csv";
          break;
        case "geojson":
          content = convertToGeoJSON(normalizedData);
          fileExtension = ".geojson";
          mimeType = "application/json";
          break;
        case "gpx":
          content = convertToGPX(normalizedData);
          fileExtension = ".gpx";
          mimeType = "application/gpx+xml";
          break;
        case "kml":
          content = convertToKML(normalizedData);
          fileExtension = ".kml";
          mimeType = "application/vnd.google-earth.kml+xml";
          break;
      }

      const fileSize = getByteSize(content);

      if (fileSize > LARGE_FILE_THRESHOLD) {
        setExporting(false);
        setExportProgress("");

        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Large Export",
            `The export file is ${formatBytes(
              fileSize
            )}. This may take a moment to save and share. Continue?`,
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Continue", onPress: () => resolve(true) },
            ],
            { cancelable: false }
          );
        });

        if (!confirmed) {
          setSelectedFormat(null);
          return;
        }

        setExporting(true);
      }

      const fileName = `colota_export_${Date.now()}${fileExtension}`;

      setExportProgress(`Saving file (${formatBytes(fileSize)})...`);

      const filePath = await NativeLocationService.writeFile(fileName, content);

      setExporting(false);
      setExportProgress("");

      await new Promise<void>((resolve) => setTimeout(resolve, 300));

      try {
        await NativeLocationService.shareFile(
          filePath,
          mimeType,
          `Colota Export - ${stats.totalLocations} locations`
        );
      } catch (shareError: any) {
        console.warn("[ExportDataScreen] Share error:", shareError);
      }

      setTimeout(async () => {
        try {
          await NativeLocationService.deleteFile(filePath);
        } catch (err) {
          console.warn("[ExportDataScreen] Failed to cleanup temp file:", err);
        }
      }, 2000);
    } catch (error) {
      console.error("[ExportDataScreen] Export failed:", error);
      Alert.alert(
        "Export Failed",
        "Unable to export your data. Please try again."
      );
    } finally {
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

        {/* Stats Card */}
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
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Total
              </Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {stats.totalLocations.toLocaleString()}
              </Text>
            </View>

            <View
              style={[styles.statsDivider, { backgroundColor: colors.border }]}
            />

            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                File Size
              </Text>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {fileSize ?? "–"}
              </Text>
            </View>
          </View>
        </View>

        {/* Format Selection */}
        <View style={styles.section}>
          <SectionTitle>Select Format</SectionTitle>

          <Card>
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
                    {stats.totalLocations.toLocaleString()} locations
                    {fileSize ? ` • ${fileSize}` : ""}
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

// --- Format Option Component ---

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
      {selected && (
        <View
          style={[styles.selectionBar, { backgroundColor: colors.primary }]}
        />
      )}

      <View style={styles.formatContent}>
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

const convertToCSV = (data: LocationCoords[]): string => {
  const headers =
    "id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery\n";
  const rows = data
    .map((item, i) => {
      const timestamp = item.timestamp ?? Date.now();
      const isoTime = new Date(timestamp).toISOString();
      return [
        i,
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

const convertToGeoJSON = (data: LocationCoords[]): string => {
  const features = data.map((item, i) => {
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
        id: i,
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

const convertToGPX = (data: LocationCoords[]): string => {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Colota" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Colota Location Export</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Colota Track Export</name>
    <trkseg>`;

  data.forEach((item) => {
    const timestamp = item.timestamp ?? Date.now();
    const isoTime = new Date(timestamp).toISOString();
    gpx += `
      <trkpt lat="${item.latitude.toFixed(6)}" lon="${item.longitude.toFixed(
      6
    )}">
        <ele>${item.altitude || 0}</ele>
        <time>${isoTime}</time>
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

const convertToKML = (data: LocationCoords[]): string => {
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

  data.forEach((item) => {
    const timestamp = item.timestamp ?? Date.now();
    const isoTime = new Date(timestamp).toISOString();
    kml += `
    <Placemark>
      <TimeStamp><when>${isoTime}</when></TimeStamp>
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

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
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
  statsDivider: {
    width: 1,
    marginHorizontal: 12,
    opacity: 0.3,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
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
  disabledButton: {
    opacity: 0.5,
  },
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
