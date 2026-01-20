/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect } from "react";
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  Linking,
  TouchableOpacity,
  Image,
} from "react-native";
import DeviceInfo from "react-native-device-info";
import { ScreenProps, ThemeColors } from "../types/global";
import { useTheme } from "../hooks/useTheme";
import { SectionTitle, Card, Container, Divider, Footer } from "../components";
import NativeLocationService from "../services/NativeLocationService";

const REPO_URL = "https://github.com/dietrichmax/colota";
const PRIVACY_POLICY_URL = "https://mxd.codes/colota/privacy-policy";

// Helper function to map SDK to Android version
function getAndroidVersion(sdkVersion: number): string {
  const versions: Record<number, string> = {
    24: "7.0",
    25: "7.1",
    26: "8.0",
    27: "8.1",
    28: "9",
    29: "10",
    30: "11",
    31: "12",
    32: "12L",
    33: "13",
    34: "14",
    35: "15",
    36: "16",
    37: "17",
  };
  return versions[sdkVersion] || "Unknown";
}

// Moved outside of AboutScreen component
const LinkButton = ({
  icon,
  title,
  subtitle,
  url,
  colors,
  onOpenURL,
}: {
  icon: string;
  title: string;
  subtitle: string;
  url: string;
  colors: ThemeColors;
  onOpenURL: (url: string) => void;
}) => (
  <TouchableOpacity
    style={[styles.linkButton, { backgroundColor: colors.background }]}
    onPress={() => onOpenURL(url)}
    activeOpacity={0.7}
  >
    <View style={styles.linkContent}>
      <Text style={styles.linkIcon}>{icon}</Text>
      <View style={styles.linkTextContainer}>
        <Text style={[styles.linkTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.linkSubtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: colors.textLight }]}>›</Text>
    </View>
  </TouchableOpacity>
);

// Moved outside of AboutScreen component
const TechRow = ({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
}) => (
  <>
    <View style={styles.techRow}>
      <Text style={[styles.techLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.techValue, { color: colors.text }]}>{value}</Text>
    </View>
    <Divider />
  </>
);

export function AboutScreen({}: ScreenProps) {
  const { colors } = useTheme();
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState({
    systemVersion: "...",
    apiLevel: "...",
  });

  const buildConfig = NativeLocationService.getBuildConfig();

  // Reset tap count after 2 seconds
  useEffect(() => {
    if (tapCount > 0) {
      const timer = setTimeout(() => setTapCount(0), 2000);
      return () => clearTimeout(timer);
    }
  }, [tapCount]);

  const handleVersionTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);

    // Enable debug mode after 7 taps (like Android's Developer Options)
    if (newCount >= 7) {
      setShowDebugInfo(true);
      setTapCount(0);
    }
  };

  useEffect(() => {
    const loadDeviceInfo = async () => {
      const apiLevel = await DeviceInfo.getApiLevel();

      setDeviceInfo({
        systemVersion: DeviceInfo.getSystemVersion(),
        apiLevel: apiLevel.toString(),
      });
    };

    loadDeviceInfo();
  }, []);

  const handleOpenURL = (url: string) => {
    Linking.openURL(url).catch((err) =>
      console.error("Failed to open URL:", err)
    );
  };

  // Fallback if buildConfig is not available
  if (!buildConfig) {
    return (
      <Container>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Colota</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Build configuration unavailable
            </Text>
          </View>
        </ScrollView>
      </Container>
    );
  }

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* App Icon & Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.appIconContainer}
            onPress={handleVersionTap}
            activeOpacity={0.8}
          >
            <Image
              source={require("../../assets/icon.png")}
              style={styles.appIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Colota</Text>
          <TouchableOpacity
            style={[styles.versionBadge, { backgroundColor: colors.success }]}
            onPress={handleVersionTap}
            activeOpacity={0.8}
          >
            <Text style={styles.versionText}>
              v{buildConfig.VERSION_NAME} ({buildConfig.VERSION_CODE})
            </Text>
          </TouchableOpacity>

          {/* Tap counter hint */}
          {tapCount > 0 && tapCount < 7 && (
            <Text style={[styles.debugHint, { color: colors.textLight }]}>
              {7 - tapCount} more taps to enable debug mode
            </Text>
          )}

          {showDebugInfo && (
            <TouchableOpacity
              onPress={() => setShowDebugInfo(false)}
              style={styles.debugBadge}
            >
              <Text style={styles.debugText}>🐛 Debug Mode (tap to hide)</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Description Card */}
        <Card style={styles.descriptionCard}>
          <Text style={[styles.tagline, { color: colors.primary }]}>
            Privacy-First Location Tracking
          </Text>
          <Text style={[styles.description, { color: colors.text }]}>
            A self-hosted location tracking client built for Dawarich and
            GeoPulse. Modern Android{" "}
            {getAndroidVersion(buildConfig.TARGET_SDK_VERSION)} standards with
            battery efficiency and data sovereignty at its core.
          </Text>
        </Card>

        {/* Quick Links */}
        <View style={styles.section}>
          <SectionTitle>QUICK LINKS</SectionTitle>
          <LinkButton
            icon="📄"
            title="Privacy Policy"
            subtitle="How your data is handled"
            url={PRIVACY_POLICY_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
          <LinkButton
            icon="💻"
            title="View Source Code"
            subtitle="GitHub Repository"
            url={REPO_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
        </View>

        {/* License Section */}

        <TouchableOpacity
          style={[styles.linkButton, { backgroundColor: colors.background }]}
          onPress={() =>
            handleOpenURL(
              "https://github.com/dietrichmax/colota/blob/main/LICENSE"
            )
          }
          activeOpacity={0.7}
        >
          <View style={styles.section}>
            <SectionTitle>LICENSE</SectionTitle>
            <Card>
              <View style={styles.licenseHeader}>
                <Text style={[styles.licenseBadge, { color: colors.primary }]}>
                  📜 GNU AGPLv3
                </Text>
              </View>
              <Text
                style={[styles.licenseText, { color: colors.textSecondary }]}
              >
                Free and open-source software. You're free to inspect, modify,
                and redistribute the code. Network-based modifications must be
                shared with the community.
              </Text>
            </Card>
          </View>
        </TouchableOpacity>

        {/* Tech Info - App Version */}
        <View style={styles.section}>
          <SectionTitle>APP VERSION</SectionTitle>
          <Card>
            <TechRow
              label="Version"
              value={`${buildConfig.VERSION_NAME}`}
              colors={colors}
            />
            <TechRow
              label="Build"
              value={`${buildConfig.VERSION_CODE}`}
              colors={colors}
            />
            <View style={styles.techRow}>
              <Text style={[styles.techLabel, { color: colors.textSecondary }]}>
                Framework
              </Text>
              <Text style={[styles.techValue, { color: colors.text }]}>
                React Native
              </Text>
            </View>
          </Card>
        </View>

        {/* Debug Info - Only shown when enabled */}
        {showDebugInfo && (
          <>
            <View style={styles.section}>
              <SectionTitle>🐛 DEBUG: BUILD CONFIGURATION</SectionTitle>
              <Card>
                <TechRow
                  label="Target SDK"
                  value={`${
                    buildConfig.TARGET_SDK_VERSION
                  } (Android ${getAndroidVersion(
                    buildConfig.TARGET_SDK_VERSION
                  )})`}
                  colors={colors}
                />
                <TechRow
                  label="Min SDK"
                  value={`${
                    buildConfig.MIN_SDK_VERSION
                  } (Android ${getAndroidVersion(
                    buildConfig.MIN_SDK_VERSION
                  )})`}
                  colors={colors}
                />
                <TechRow
                  label="Compile SDK"
                  value={buildConfig.COMPILE_SDK_VERSION.toString()}
                  colors={colors}
                />
                <TechRow
                  label="Build Tools"
                  value={buildConfig.BUILD_TOOLS_VERSION}
                  colors={colors}
                />
                <TechRow
                  label="Kotlin Version"
                  value={buildConfig.KOTLIN_VERSION}
                  colors={colors}
                />
                <View style={styles.techRow}>
                  <Text
                    style={[styles.techLabel, { color: colors.textSecondary }]}
                  >
                    NDK Version
                  </Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>
                    {buildConfig.NDK_VERSION}
                  </Text>
                </View>
              </Card>
            </View>

            <View style={styles.section}>
              <SectionTitle>🐛 DEBUG: DEVICE INFORMATION</SectionTitle>
              <Card>
                <TechRow
                  label="OS Version"
                  value={`Android ${deviceInfo.systemVersion}`}
                  colors={colors}
                />
                <TechRow
                  label="API Level"
                  value={deviceInfo.apiLevel}
                  colors={colors}
                />
                <TechRow
                  label="Device Model"
                  value={DeviceInfo.getModel()}
                  colors={colors}
                />
                <TechRow
                  label="Device Brand"
                  value={DeviceInfo.getBrand()}
                  colors={colors}
                />
                <View style={styles.techRow}>
                  <Text
                    style={[styles.techLabel, { color: colors.textSecondary }]}
                  >
                    Device ID
                  </Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>
                    {DeviceInfo.getDeviceId()}
                  </Text>
                </View>
              </Card>
            </View>
          </>
        )}

        {/* Footer */}
        <Footer />
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8,
  },
  header: {
    marginTop: 20,
    marginBottom: 28,
    alignItems: "center",
  },
  appIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  appIcon: {
    width: 80,
    height: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  versionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  versionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  descriptionCard: {
    marginBottom: 24,
  },
  tagline: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  linkButton: {
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  linkContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  linkIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  linkTextContainer: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  linkSubtitle: {
    fontSize: 13,
  },
  chevron: {
    fontSize: 28,
    fontWeight: "300",
    marginLeft: 8,
  },
  licenseHeader: {
    marginBottom: 12,
  },
  licenseBadge: {
    fontSize: 16,
    fontWeight: "700",
  },
  licenseText: {
    fontSize: 14,
    lineHeight: 20,
  },
  techRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  techLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  techValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  debugHint: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: "italic",
  },
  debugBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 152, 0, 0.2)",
    borderRadius: 8,
  },
  debugText: {
    fontSize: 12,
    color: "#FF9800",
    fontWeight: "600",
  },
});
