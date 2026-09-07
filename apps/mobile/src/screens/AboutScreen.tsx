/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Text, StyleSheet, View, ScrollView, Image } from "react-native"
import { ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { Copy, Check } from "lucide-react-native"
import { fontSizes, fonts, lineHeights, type } from "../styles/typography"
import { Button, Card, Container, Divider, Footer, SectionTitle, StatRow } from "../components"
import { useTimeout } from "../hooks/useTimeout"
import NativeLocationService from "../services/NativeLocationService"
import icon from "../assets/icons/icon.png"
import { space } from "../constants"
import { logger } from "../utils/logger"

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

function InfoCard({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <Card>
      {rows.map((row, i) => (
        <React.Fragment key={row.label}>
          <StatRow label={row.label} value={row.value} />
          {i < rows.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </Card>
  )
}

export function AboutScreen({}: ScreenProps) {
  const { colors } = useTheme()
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

  // Persist debug mode changes

  // Load device info lazily when debug mode is enabled
  useEffect(() => {
    if (deviceInfo) return

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
  }, [deviceInfo])

  // Reset tap count after 2 seconds

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
          <View style={styles.appIconContainer}>
            <Image source={icon} style={styles.appIcon} resizeMode="contain" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Colota</Text>
          <Text style={[styles.version, { color: colors.textSecondary }]}>Version {buildConfig.VERSION_NAME}</Text>
        </View>

        <>
          <View style={styles.section}>
            <SectionTitle>Build</SectionTitle>
            <InfoCard rows={debugRows} />
          </View>

          {deviceRows.length > 0 && (
            <View style={styles.section}>
              <SectionTitle>Device</SectionTitle>
              <InfoCard rows={deviceRows} />
            </View>
          )}

          <View style={styles.debugActions}>
            <Button
              variant="secondary"
              icon={copied ? Check : Copy}
              title={copied ? "Copied!" : "Copy debug info"}
              testID="copy-debug-info-btn"
              onPress={handleCopyDebugInfo}
            />

            <Text style={[styles.logHint, { color: colors.textLight }]}>
              View and export logs from Settings &gt; Logging.
            </Text>
          </View>
        </>

        <Footer />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    paddingTop: space.sm
  },
  header: {
    marginTop: space.xl,
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
    ...type.display,
    marginBottom: space.xs
  },
  version: {
    fontSize: fontSizes.description,
    ...fonts.regular
  },
  section: {
    marginTop: space.xl
  },
  debugActions: {
    gap: space.md,
    marginTop: space.lg
  },
  logHint: {
    fontSize: fontSizes.caption,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: lineHeights.caption
  }
})
