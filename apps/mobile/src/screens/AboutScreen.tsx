/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback } from "react"
import { Text, StyleSheet, View, ScrollView, Linking, TouchableOpacity, Image } from "react-native"
import { ScreenProps, ThemeColors } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { ChevronRight, Bug, FileText, Code, ScrollText, MessageCircle, Copy, Check } from "lucide-react-native"
import { fonts } from "../styles/typography"
import { Card, Container, Divider, SectionTitle, Footer } from "../components"
import NativeLocationService from "../services/NativeLocationService"
import icon from "../assets/icons/icon.png"
import { REPO_URL, ISSUES_URL, PRIVACY_POLICY_URL } from "../constants"
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
  <TouchableOpacity style={styles.linkRow} onPress={() => onOpenURL(url)} activeOpacity={0.7}>
    <Icon size={20} color={colors.primaryDark} />
    <View style={styles.linkTextContainer}>
      <Text style={[styles.linkTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.linkSubtitle, { color: colors.textLight }]}>{subtitle}</Text>
    </View>
    <ChevronRight size={18} color={colors.textLight} />
  </TouchableOpacity>
)

const DEBUG_MODE_SETTING_KEY = "debug_mode_enabled"

export function AboutScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const [tapCount, setTapCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState<{
    model: string
    brand: string
    deviceId: string
    systemVersion: string
    apiLevel: string
  } | null>(null)

  const buildConfig = NativeLocationService.getBuildConfig()

  // Load persisted debug mode
  useEffect(() => {
    NativeLocationService.getSetting(DEBUG_MODE_SETTING_KEY, "false").then((value) => {
      if (value === "true") setShowDebugInfo(true)
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

  const handleVersionTap = () => {
    const newCount = tapCount + 1
    setTapCount(newCount)

    if (newCount >= 7) {
      toggleDebugMode(true)
      setTapCount(0)
    }
  }

  const handleOpenURL = (url: string) => {
    Linking.openURL(url).catch((err) => logger.error("Failed to open URL:", err))
  }

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
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      logger.error("Failed to copy debug info:", err)
    }
  }, [buildConfig, deviceInfo])

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
    { label: "Build Tools", value: buildConfig.BUILD_TOOLS_VERSION },
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
          <TouchableOpacity style={styles.appIconContainer} onPress={handleVersionTap} activeOpacity={0.8}>
            <Image source={icon} style={styles.appIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Colota</Text>
          <TouchableOpacity onPress={handleVersionTap} activeOpacity={0.8}>
            <Text style={[styles.version, { color: colors.textSecondary }]}>Version {buildConfig.VERSION_NAME}</Text>
          </TouchableOpacity>

          {/* Tap counter hint */}
          {tapCount > 0 && tapCount < 7 && (
            <Text style={[styles.debugHint, { color: colors.textLight }]}>
              {7 - tapCount} more taps to enable debug mode
            </Text>
          )}

          {showDebugInfo && (
            <TouchableOpacity
              onPress={() => toggleDebugMode(false)}
              style={[styles.debugBadge, { backgroundColor: colors.warning + "20" }]}
            >
              <Bug size={14} color={colors.warning} />
              <Text style={[styles.debugText, { color: colors.warning }]}>Debug Mode (tap to hide)</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Links */}
        <Card>
          <LinkRow
            icon={FileText}
            title="Privacy Policy"
            subtitle={PRIVACY_POLICY_URL}
            url={PRIVACY_POLICY_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
          <Divider />
          <LinkRow
            icon={Code}
            title="Source Code"
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
            title="Report a Bug"
            subtitle="github.com/dietrichmax/colota/issues"
            url={ISSUES_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
        </Card>

        {/* Debug Info - Only shown when enabled */}
        {showDebugInfo && (
          <>
            <View style={styles.debugSection}>
              <SectionTitle>BUILD</SectionTitle>
              <Card>
                {debugRows.map((row, i) => (
                  <React.Fragment key={row.label}>
                    <View style={styles.techRow}>
                      <Text style={[styles.techLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                      <Text style={[styles.techValue, { color: colors.text }]}>{row.value}</Text>
                    </View>
                    {i < debugRows.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </Card>
            </View>

            {deviceRows.length > 0 && (
              <View style={styles.debugSection}>
                <SectionTitle>DEVICE</SectionTitle>
                <Card>
                  {deviceRows.map((row, i) => (
                    <React.Fragment key={row.label}>
                      <View style={styles.techRow}>
                        <Text style={[styles.techLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                        <Text style={[styles.techValue, { color: colors.text }]}>{row.value}</Text>
                      </View>
                      {i < deviceRows.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </Card>
              </View>
            )}

            <TouchableOpacity
              style={[styles.copyButton, { borderColor: colors.border }]}
              onPress={handleCopyDebugInfo}
              activeOpacity={0.7}
            >
              {copied ? <Check size={16} color={colors.success} /> : <Copy size={16} color={colors.primaryDark} />}
              <Text style={[styles.copyButtonText, { color: copied ? colors.success : colors.primaryDark }]}>
                {copied ? "Copied!" : "Copy Debug Info"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <Footer />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8
  },
  header: {
    marginTop: 20,
    marginBottom: 24,
    alignItems: "center"
  },
  appIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden"
  },
  appIcon: {
    width: 80,
    height: 80
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    marginBottom: 4
  },
  version: {
    fontSize: 13,
    ...fonts.regular
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12
  },
  linkTextContainer: {
    flex: 1
  },
  linkTitle: {
    fontSize: 15,
    ...fonts.semiBold
  },
  linkSubtitle: {
    fontSize: 12,
    marginTop: 1
  },
  techRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8
  },
  techLabel: {
    fontSize: 14,
    ...fonts.medium
  },
  techValue: {
    fontSize: 14,
    ...fonts.semiBold
  },
  debugSection: {
    marginTop: 24
  },
  debugHint: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: "italic"
  },
  debugBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  debugText: {
    fontSize: 12,
    ...fonts.semiBold
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1
  },
  copyButtonText: {
    fontSize: 14,
    ...fonts.semiBold
  }
})
