/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Text, StyleSheet, View, ScrollView, Linking, Pressable, Image } from "react-native"
import { ScreenProps, ThemeColors } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { ExternalLink, Bug, FileText, Code, ScrollText, MessageCircle, Copy, Check } from "lucide-react-native"
import { fontSizes, fonts } from "../styles/typography"
import { Card, Container, Divider, SectionTitle, Footer } from "../components"
import { useTimeout } from "../hooks/useTimeout"
import NativeLocationService from "../services/NativeLocationService"
import icon from "../assets/icons/icon.png"
import { ISSUES_URL, PRIVACY_POLICY_URL, REPO_URL, TILE_SERVER_DOCS_URL, size, space } from "../constants"
import { logger } from "../utils/logger"
import { radius } from "@colota/shared"

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
    37: "17"
  }
  return versions[sdkVersion] || "Unknown"
}

function getVariantLabel(flavor: string): string {
  switch (flavor) {
    case "foss":
      return "FOSS"
    case "gms":
      return "Google Play"
    default:
      return flavor || "Unknown"
  }
}

const LinkRow = ({
  icon: Icon,
  title,
  subtitle,
  url,
  colors,
  onOpenURL
}: {
  icon: React.ComponentType<{ size: number; color: string }>
  title: string
  subtitle: string
  url: string
  colors: ThemeColors
  onOpenURL: (url: string) => void
}) => (
  <Pressable
    style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
    onPress={() => onOpenURL(url)}
  >
    <Icon size={size.icon.md} color={colors.textLight} />
    <View style={styles.linkTextContainer}>
      <Text style={[styles.linkTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.linkSubtitle, { color: colors.textLight }]}>{subtitle}</Text>
    </View>
    <ExternalLink size={size.icon.md} color={colors.textLight} />
  </Pressable>
)

const DEBUG_MODE_SETTING_KEY = "debug_mode_enabled"

function InfoCard({ rows }: { rows: { label: string; value: string }[] }) {
  const { colors } = useTheme()
  return (
    <Card>
      {rows.map((row, i) => (
        <React.Fragment key={row.label}>
          <View style={styles.techRow}>
            <Text style={[styles.techLabel, { color: colors.textSecondary }]}>{row.label}</Text>
            <Text style={[styles.techValue, { color: colors.text }]}>{row.value}</Text>
          </View>
          {i < rows.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </Card>
  )
}

export function AboutScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const [tapCount, setTapCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const copiedTimeout = useTimeout()
  const [deviceInfo, setDeviceInfo] = useState<{
    model: string
    brand: string
    deviceId: string
    systemVersion: string
    apiLevel: string
  } | null>(null)

  const buildConfig = useMemo(() => NativeLocationService.getBuildConfig(), [])

  // Load persisted debug mode
  useEffect(() => {
    NativeLocationService.getSetting(DEBUG_MODE_SETTING_KEY, "false").then((value) => {
      if (value === "true") {
        setShowDebugInfo(true)
      }
    })
  }, [])

  // Persist debug mode changes
  const toggleDebugMode = useCallback((enabled: boolean) => {
    setShowDebugInfo(enabled)
    NativeLocationService.saveSetting(DEBUG_MODE_SETTING_KEY, String(enabled))
  }, [])

  // Load device info lazily when debug mode is enabled
  useEffect(() => {
    if (!showDebugInfo || deviceInfo) return

    NativeLocationService.getDeviceInfo()
      .then((info) => {
        setDeviceInfo({
          model: info.model,
          brand: info.brand,
          deviceId: info.deviceId,
          systemVersion: info.systemVersion,
          apiLevel: info.apiLevel.toString()
        })
      })
      .catch((err) => logger.error("Failed to load device info:", err))
  }, [showDebugInfo, deviceInfo])

  // Reset tap count after 2 seconds
  useEffect(() => {
    if (tapCount > 0) {
      const timer = setTimeout(() => setTapCount(0), 2000)
      return () => clearTimeout(timer)
    }
  }, [tapCount])

  const handleVersionTap = useCallback(() => {
    const newCount = tapCount + 1
    setTapCount(newCount)

    if (newCount >= 7) {
      toggleDebugMode(true)
      setTapCount(0)
    }
  }, [tapCount, toggleDebugMode])

  const handleOpenURL = useCallback((url: string) => {
    Linking.openURL(url).catch((err) => logger.error("Failed to open URL:", err))
  }, [])

  const handleCopyDebugInfo = useCallback(async () => {
    if (!buildConfig) return

    const lines = [
      `Colota v${buildConfig.VERSION_NAME} (${buildConfig.VERSION_CODE})`,
      `Variant: ${getVariantLabel(buildConfig.FLAVOR)}`,
      `Target SDK: ${buildConfig.TARGET_SDK_VERSION} (Android ${getAndroidVersion(buildConfig.TARGET_SDK_VERSION)})`,
      `Min SDK: ${buildConfig.MIN_SDK_VERSION} (Android ${getAndroidVersion(buildConfig.MIN_SDK_VERSION)})`,
      `Compile SDK: ${buildConfig.COMPILE_SDK_VERSION}`,
      `Build Tools: ${buildConfig.BUILD_TOOLS_VERSION}`,
      `Kotlin: ${buildConfig.KOTLIN_VERSION}`,
      `NDK: ${buildConfig.NDK_VERSION}`
    ]

    if (deviceInfo) {
      lines.push(
        "",
        `OS: Android ${deviceInfo.systemVersion} (API ${deviceInfo.apiLevel})`,
        `Device: ${deviceInfo.brand} ${deviceInfo.model}`,
        `Device ID: ${deviceInfo.deviceId}`
      )
    }

    try {
      await NativeLocationService.copyToClipboard(lines.join("\n"), "Debug Info")
      setCopied(true)
      copiedTimeout.set(() => setCopied(false), 2000)
    } catch (err) {
      logger.error("Failed to copy debug info:", err)
    }
  }, [buildConfig, deviceInfo, copiedTimeout])

  // Fallback if buildConfig is not available
  if (!buildConfig) {
    return (
      <Container>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Colota</Text>
          </View>
        </ScrollView>
      </Container>
    )
  }

  const debugRows = [
    { label: "Variant", value: getVariantLabel(buildConfig.FLAVOR) },
    {
      label: "Target SDK",
      value: `${buildConfig.TARGET_SDK_VERSION} (Android ${getAndroidVersion(buildConfig.TARGET_SDK_VERSION)})`
    },
    {
      label: "Min SDK",
      value: `${buildConfig.MIN_SDK_VERSION} (Android ${getAndroidVersion(buildConfig.MIN_SDK_VERSION)})`
    },
    { label: "Compile SDK", value: buildConfig.COMPILE_SDK_VERSION.toString() },
    { label: "Build tools", value: buildConfig.BUILD_TOOLS_VERSION },
    { label: "Kotlin", value: buildConfig.KOTLIN_VERSION },
    { label: "NDK", value: buildConfig.NDK_VERSION }
  ]

  const deviceRows = deviceInfo
    ? [
        { label: "OS", value: `Android ${deviceInfo.systemVersion}` },
        { label: "API Level", value: deviceInfo.apiLevel },
        { label: "Model", value: deviceInfo.model },
        { label: "Brand", value: deviceInfo.brand },
        { label: "Device ID", value: deviceInfo.deviceId }
      ]
    : []

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.appIconContainer, pressed && { opacity: 0.8 }]}
            onPress={handleVersionTap}
          >
            <Image source={icon} style={styles.appIcon} resizeMode="contain" />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Colota</Text>
          <Pressable onPress={handleVersionTap} style={({ pressed }) => pressed && { opacity: 0.8 }}>
            <Text style={[styles.version, { color: colors.textSecondary }]}>Version {buildConfig.VERSION_NAME}</Text>
          </Pressable>

          {/* Tap counter hint */}
          {tapCount > 0 && tapCount < 7 && (
            <Text style={[styles.debugHint, { color: colors.textLight }]}>
              {7 - tapCount} more taps to enable debug mode
            </Text>
          )}

          {showDebugInfo && (
            <Pressable
              onPress={() => toggleDebugMode(false)}
              style={({ pressed }) => [
                styles.debugBadge,
                { backgroundColor: colors.warning + "20" },
                pressed && { opacity: colors.pressedOpacity }
              ]}
            >
              <Bug size={size.icon.sm} color={colors.warning} />
              <Text style={[styles.debugText, { color: colors.warning }]}>Debug Mode (tap to hide)</Text>
            </Pressable>
          )}
        </View>

        {/* Links */}
        <Card>
          <LinkRow
            icon={FileText}
            title="Privacy policy"
            subtitle={PRIVACY_POLICY_URL}
            url={PRIVACY_POLICY_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
          <Divider />
          <LinkRow
            icon={Code}
            title="Source code"
            subtitle="github.com/dietrichmax/colota"
            url={REPO_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
          <Divider />
          <LinkRow
            icon={ScrollText}
            title="License"
            subtitle="GNU AGPLv3"
            url={`${REPO_URL}/blob/main/LICENSE`}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
          <Divider />
          <LinkRow
            icon={MessageCircle}
            title="Report a bug"
            subtitle="github.com/dietrichmax/colota/issues"
            url={ISSUES_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
        </Card>

        {/* Map Data Attribution */}
        <View style={styles.section}>
          <SectionTitle>Map data</SectionTitle>
          <Card>
            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={() => handleOpenURL(TILE_SERVER_DOCS_URL)}
            >
              <View style={styles.linkTextContainer}>
                <Text style={[styles.linkTitle, { color: colors.text }]}>Colota tiles</Text>
                <Text style={[styles.linkSubtitle, { color: colors.textLight }]}>
                  Self-hosted map tile server - configure your own
                </Text>
              </View>
              <ExternalLink size={size.icon.md} color={colors.textLight} />
            </Pressable>
            <Divider />
            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={() => handleOpenURL("https://www.openstreetmap.org/copyright")}
            >
              <View style={styles.linkTextContainer}>
                <Text style={[styles.linkTitle, { color: colors.text }]}>OpenStreetMap</Text>
                <Text style={[styles.linkSubtitle, { color: colors.textLight }]}>
                  Map data by OpenStreetMap contributors
                </Text>
              </View>
              <ExternalLink size={size.icon.md} color={colors.textLight} />
            </Pressable>
          </Card>
        </View>

        {/* Debug Info - Only shown when enabled */}
        {showDebugInfo && (
          <>
            <View style={styles.section}>
              <SectionTitle>BUILD</SectionTitle>
              <InfoCard rows={debugRows} />
            </View>

            {deviceRows.length > 0 && (
              <View style={styles.section}>
                <SectionTitle>DEVICE</SectionTitle>
                <InfoCard rows={deviceRows} />
              </View>
            )}

            <View style={styles.debugActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.copyButton,
                  { borderColor: colors.border },
                  pressed && { opacity: colors.pressedOpacity }
                ]}
                onPress={handleCopyDebugInfo}
              >
                {copied ? (
                  <Check size={size.icon.sm} color={colors.success} />
                ) : (
                  <Copy size={size.icon.sm} color={colors.primaryDark} />
                )}
                <Text style={[styles.copyButtonText, { color: copied ? colors.success : colors.primaryDark }]}>
                  {copied ? "Copied!" : "Copy debug info"}
                </Text>
              </Pressable>

              <Text style={[styles.logHint, { color: colors.textLight }]}>
                View and export logs from Settings &gt; Logging.
              </Text>
            </View>
          </>
        )}

        <Footer />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: 40,
    paddingTop: space.sm
  },
  header: {
    marginTop: 20,
    marginBottom: space.xl,
    alignItems: "center"
  },
  appIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg,
    overflow: "hidden"
  },
  appIcon: {
    width: 80,
    height: 80
  },
  title: {
    fontSize: fontSizes.screenTitle,
    ...fonts.bold,
    marginBottom: space.xs
  },
  version: {
    fontSize: fontSizes.description,
    ...fonts.regular
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: space.md
  },
  linkTextContainer: {
    flex: 1
  },
  linkTitle: {
    fontSize: fontSizes.input,
    ...fonts.semiBold
  },
  linkSubtitle: {
    fontSize: fontSizes.caption,
    marginTop: 1
  },
  techRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.sm
  },
  techLabel: {
    fontSize: fontSizes.body,
    ...fonts.medium
  },
  techValue: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  section: {
    marginTop: space.xl
  },
  debugHint: {
    fontSize: fontSizes.small,
    marginTop: space.sm,
    fontStyle: "italic"
  },
  debugBadge: {
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  debugText: {
    fontSize: fontSizes.caption,
    ...fonts.semiBold
  },
  debugActions: {
    gap: 10,
    marginTop: space.lg
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1
  },
  copyButtonText: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  logHint: {
    fontSize: fontSizes.caption,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 16
  }
})
